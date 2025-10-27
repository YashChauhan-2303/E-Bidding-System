import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { AuctionCard } from '@/components/auction/AuctionCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Search, Filter, Loader2 } from 'lucide-react';

export default function Auctions() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('ending-soon');

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

  useEffect(() => {
    async function fetchAuctions() {
      setLoading(true);
      
      // Fetch live auctions and recently-ended auctions (ended within last 3 hours)
      const threeHoursAgoIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

      const livePromise = supabase
        .from('auctions')
        .select(`
          id,
          current_price,
          end_time,
          status,
          created_at,
          item:items!inner(
            id,
            title,
            images,
            category_id
          )
        `)
        .eq('status', 'live');

      const recentEndedPromise = supabase
        .from('auctions')
        .select(`
          id,
          current_price,
          end_time,
          status,
          created_at,
          item:items!inner(
            id,
            title,
            images,
            category_id
          )
        `)
        .eq('status', 'ended')
        .gte('end_time', threeHoursAgoIso);

      const [{ data: liveData }, { data: endedData }] = await Promise.all([livePromise, recentEndedPromise]);

      let combined: any[] = [];
      if (liveData) combined = combined.concat(liveData as any[]);
      if (endedData) combined = combined.concat(endedData as any[]);

      // Normalize status based on end_time: if an auction is marked 'live' in DB but
      // its end_time is in the past, treat it as 'ended' for UI purposes. Only include
      // items that are currently live or ended within the last 3 hours.
      const nowMs = Date.now();
      const threeHoursMs = 3 * 60 * 60 * 1000;
      combined = combined
        .map((a) => {
          const endMs = a.end_time ? new Date(a.end_time).getTime() : Infinity;
          let effectiveStatus = a.status;
          if (a.status === 'live' && endMs <= nowMs) effectiveStatus = 'ended';
          return { ...a, effectiveStatus, endMs };
        })
        .filter((a) => {
          if (a.effectiveStatus === 'live') return true;
          if (a.effectiveStatus === 'ended' && nowMs - a.endMs <= threeHoursMs) return true;
          return false;
        });

      // Client-side filters
      if (selectedCategory !== 'all') {
        combined = combined.filter((a) => a.item?.category_id === selectedCategory);
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        combined = combined.filter((a) => String(a.item?.title || '').toLowerCase().includes(term));
      }

      // Sorting
      switch (sortBy) {
        case 'ending-soon':
          combined.sort((x, y) => new Date(x.end_time).getTime() - new Date(y.end_time).getTime());
          break;
        case 'newly-listed':
          combined.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
          break;
        case 'price-low':
          combined.sort((x, y) => Number(x.current_price) - Number(y.current_price));
          break;
        case 'price-high':
          combined.sort((x, y) => Number(y.current_price) - Number(x.current_price));
          break;
      }

      // Fetch bids for these auctions to compute counts and winners
      const auctionIds = combined.map((a) => a.id).filter(Boolean);
        const bidCounts: Record<string, number> = {};
        const winners: Record<string, string | null> = {};
      if (auctionIds.length > 0) {
        const { data: bidsData } = await supabase
          .from('bids')
          .select('auction_id, amount, bidder:profiles(username)')
          .in('auction_id', auctionIds)
          .order('amount', { ascending: false });

        if (bidsData) {
          for (const b of bidsData as Array<Record<string, unknown>>) {
            const aid = String(b['auction_id']);
            bidCounts[aid] = (bidCounts[aid] || 0) + 1;
            if (!(aid in winners)) {
              const bidder = b['bidder'] as Record<string, unknown> | undefined;
              const username = bidder && typeof bidder['username'] === 'string' ? (bidder['username'] as string) : null;
              winners[aid] = username;
            }
          }
        }
      }

      const enriched = combined.map((a) => ({
        ...a,
        bidCount: bidCounts[a.id] || 0,
        winner: winners[a.id] || null,
      }));

      setAuctions(enriched);
      setLoading(false);
    }

    fetchAuctions();
  }, [searchTerm, selectedCategory, sortBy]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">Browse Auctions</h1>
          <p className="text-muted-foreground">Find your next treasure from live auctions</p>
        </div>

        {/* Filters */}
        <div className="mb-8 flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search auctions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ending-soon">Ending Soon</SelectItem>
              <SelectItem value="newly-listed">Newly Listed</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Auctions Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : auctions.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {auctions.map((auction) => (
              <AuctionCard
                key={auction.id}
                id={auction.id}
                title={auction.item.title}
                currentPrice={Number(auction.current_price)}
                endTime={auction.end_time}
                images={auction.item.images || []}
                status={auction.status}
                bidCount={auction.bidCount || 0}
                winner={auction.winner || null}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No auctions found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}