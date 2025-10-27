import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Upload, X } from 'lucide-react';

export default function Sell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Tables<'categories'>[]>([]);
  const [images, setImages] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category_id: '',
    condition: '',
    base_price: '',
    min_increment: '10',
    duration: '7',
    customMinutes: '',
    buy_now_price: ''
  });

  useEffect(() => {
    async function fetchCategories() {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      
      if (data) setCategories(data);
    }

    fetchCategories();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    const newImages: string[] = [];
    
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (matches bucket file_size_limit)
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    for (const file of Array.from(files)) {
      // Quick client-side checks to avoid unnecessary upload attempts
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: file too large (max 5 MB)`);
        continue;
      }
      if (!allowedTypes.has(file.type)) {
        toast.error(`${file.name}: unsupported image type (${file.type})`);
        continue;
      }

      const fileExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
      // The storage policies expect objects to be stored under a folder named by the user id
      // e.g. `user_id/filename.jpg`. Ensure we include the user id as the first path segment.
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('item-images')
        .upload(fileName, file);

      if (uploadError) {
        // Surface the server error message to help debugging (policy denied, size limits, mime type, etc.)
        const errMsg = uploadError && typeof uploadError === 'object' && 'message' in uploadError
          ? String((uploadError as { message?: unknown }).message ?? '')
          : String(uploadError);
        console.debug('uploadError detail:', uploadError);
        toast.error(`Failed to upload image: ${errMsg}`);
        continue;
      }

      const { data: pub } = supabase.storage
        .from('item-images')
        .getPublicUrl(fileName);

      // getPublicUrl returns { data: { publicUrl } }
      const pubData = pub as { publicUrl?: string } | undefined;
      if (pubData?.publicUrl) {
        newImages.push(pubData.publicUrl);
      } else {
        toast.error('Uploaded image but failed to retrieve public URL');
      }
    }

    setImages([...images, ...newImages]);
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to create a listing');
      return;
    }

    setLoading(true);

    try {
      // Validate numeric inputs before sending to the DB to avoid numeric overflow
      const basePrice = parseFloat(formData.base_price);
      const minIncrement = parseFloat(formData.min_increment);
      const buyNow = formData.buy_now_price ? parseFloat(formData.buy_now_price) : null;

      if (!isFinite(basePrice) || basePrice < 0 || basePrice > 1e12) {
        toast.error('Please enter a valid starting price (0 - 1,000,000,000,000)');
        setLoading(false);
        return;
      }

      if (!isFinite(minIncrement) || minIncrement < 0 || minIncrement > 1e12) {
        toast.error('Please enter a valid minimum increment (0 - 1,000,000,000,000)');
        setLoading(false);
        return;
      }

      if (buyNow !== null && (!isFinite(buyNow) || buyNow < 0 || buyNow > 1e12)) {
        toast.error('Please enter a valid buy now price (0 - 1,000,000,000,000)');
        setLoading(false);
        return;
      }

      // Create item
          const { data: item, error: itemError } = await supabase
        .from('items')
        .insert([{
          seller_id: user.id,
          title: formData.title,
          description: formData.description,
          category_id: formData.category_id || null,
          condition: formData.condition as Tables<'items'>['condition'],
          base_price: basePrice,
          images: images as unknown as Tables<'items'>['images']
        }])
        .select()
        .single();

      if (itemError) throw itemError;

      // Create draft auction
      const endTime = new Date();
      if (formData.duration === 'custom') {
        // customMinutes is in minutes
        const minutes = parseInt(formData.customMinutes || '0');
        if (!minutes || minutes < 1 || minutes > 43200) {
          toast.error('Please enter a valid custom duration between 1 and 43200 minutes (30 days)');
          setLoading(false);
          return;
        }
        endTime.setMinutes(endTime.getMinutes() + minutes);
      } else {
        endTime.setDate(endTime.getDate() + parseInt(formData.duration));
      }

      const { error: auctionError } = await supabase
        .from('auctions')
        .insert({
          item_id: item.id,
          status: 'pending',
          start_time: new Date().toISOString(),
          end_time: endTime.toISOString(),
          current_price: parseFloat(formData.base_price),
          min_increment: parseFloat(formData.min_increment),
          buy_now_price: formData.buy_now_price ? parseFloat(formData.buy_now_price) : null,
          anti_sniping: true
        });

      if (auctionError) throw auctionError;

      toast.success('Listing submitted for approval!');
      navigate('/profile?tab=selling');
    } catch (error: unknown) {
      // Prefer structured message when available (e.g. Supabase PostgrestError)
      let message = 'Failed to create listing';
      if (error && typeof error === 'object') {
        // PostgrestError and similar have a `message` property
        const errObj = error as Record<string, unknown>;
        if (typeof errObj.message === 'string') message = errObj.message;
        else message = JSON.stringify(errObj);
      } else if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }

      // If JSON.stringify produced a large object, fall back to generic message
      if (message.length > 300) message = 'Failed to create listing';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-8">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Create New Listing</CardTitle>
              <CardDescription>
                Fill in the details below to list your item for auction. Your listing will be reviewed before going live.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Item Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Vintage Camera"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your item in detail..."
                    rows={6}
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="condition">Condition *</Label>
                    <Select
                      value={formData.condition}
                      onValueChange={(value) => setFormData({ ...formData, condition: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="like_new">Like New</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="base_price">Starting Price (Rs) *</Label>
                    <Input
                      id="base_price"
                      type="number"
                      step="0.01"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="min_increment">Min Increment (Rs) *</Label>
                    <Input
                      id="min_increment"
                      type="number"
                      step="0.01"
                      value={formData.min_increment}
                      onChange={(e) => setFormData({ ...formData, min_increment: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration *</Label>
                    <Select
                      value={formData.duration}
                      onValueChange={(value) => setFormData({ ...formData, duration: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 day</SelectItem>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="custom">Custom (minutes)</SelectItem>
                      </SelectContent>
                    </Select>

                    {formData.duration === 'custom' && (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          id="customMinutes"
                          type="number"
                          min={1}
                          max={43200}
                          step={1}
                          value={formData.customMinutes}
                          onChange={(e) => setFormData({ ...formData, customMinutes: e.target.value })}
                          placeholder="Enter duration in minutes (e.g., 5)"
                        />
                        <span className="text-sm text-muted-foreground">minutes</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buy_now_price">Buy Now Price (Rs - optional)</Label>
                  <Input
                    id="buy_now_price"
                    type="number"
                    step="0.01"
                    value={formData.buy_now_price}
                    onChange={(e) => setFormData({ ...formData, buy_now_price: e.target.value })}
                    placeholder="Leave empty if not applicable"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Images</Label>
                  <div className="grid gap-4 sm:grid-cols-4">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square overflow-hidden rounded-lg border">
                        <img src={img} alt="" className="h-full w-full object-cover" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute right-2 top-2 h-6 w-6"
                          onClick={() => handleRemoveImage(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed hover:bg-muted">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="mt-2 text-xs text-muted-foreground">Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-primary shadow-glow"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit for Approval'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}