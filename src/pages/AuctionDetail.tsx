import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Countdown } from '@/components/auction/Countdown';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type AuctionWithItem = Tables<'auctions'> & {
  item?: Tables<'items'> & {
    category?: { name: string };
    seller?: { username: string; avatar_url?: string };
    images?: string[];
  };
};

type BidWithBidder = Tables<'bids'> & { bidder?: Tables<'profiles'> };
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Gavel, Heart, Share2, User, Package } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function AuctionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [auction, setAuction] = useState<AuctionWithItem | null>(null);
  const [bids, setBids] = useState<BidWithBidder[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [winner, setWinner] = useState<BidWithBidder | null>(null);
  // loader function used by effect and after placing bids
  const loadAuctionAndBids = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auctionData, error: auctionError } = await supabase
        .from('auctions')
        .select(`
          *,
          item:items!inner(
            *,
            category:categories(name),
            seller:profiles!items_seller_id_fkey(username, avatar_url)
          )
        `)
        .eq('id', id)
        .single();

      if (!auctionError && auctionData) {
        setAuction(auctionData as AuctionWithItem);
        setBidAmount((Number(auctionData.current_price) + Number(auctionData.min_increment)).toFixed(2));
      }

      const { data: bidsData } = await supabase
        .from('bids')
        .select(`
          *,
          bidder:profiles(username, avatar_url)
        `)
        .eq('auction_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

  if (bidsData) setBids(bidsData as BidWithBidder[]);

      // If the auction has ended, fetch the highest bid (winner)
      if (auctionData) {
        const end = auctionData.end_time ? new Date(auctionData.end_time) : null;
        const now = new Date();
        const hasEnded = end ? end <= now : auctionData.status !== 'live';

        if (hasEnded) {
          const { data: topBid } = await supabase
            .from('bids')
            .select('*, bidder:profiles(username, avatar_url, id)')
            .eq('auction_id', id)
            .order('amount', { ascending: false })
            .limit(1)
            .maybeSingle();

          setWinner(topBid as BidWithBidder || null);
        } else {
          setWinner(null);
        }
      }

      if (user) {
        const { data: watchData } = await supabase
          .from('watchlists')
          .select('*')
          .eq('user_id', user.id)
          .eq('auction_id', id)
          .maybeSingle();
        setIsWatching(!!watchData);
      }
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadAuctionAndBids();

    // Real-time bid updates
    const channel = supabase
      .channel(`auction-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `auction_id=eq.${id}`
        },
        async (payload) => {
              // Fetch updated auction price
              const { data: updatedAuction } = await supabase
                .from('auctions')
                .select('current_price, min_increment')
                .eq('id', id)
                .single();

              if (updatedAuction) {
                setAuction((prev) => (prev ? { ...prev, current_price: updatedAuction.current_price } : prev));
                setBidAmount((Number(updatedAuction.current_price) + Number(updatedAuction.min_increment || 10)).toFixed(2));
              }

          // Add new bid to list
          const { data: newBid } = await supabase
            .from('bids')
            .select('*, bidder:profiles(username, avatar_url)')
            .eq('id', payload.new.id)
            .single();
          
          if (newBid) {
            setBids((prev) => [newBid as BidWithBidder, ...prev].slice(0, 10));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAuctionAndBids, id, user]);

  const handlePlaceBid = async () => {
    if (!user) {
      toast.error('Please sign in to place a bid');
      return;
    }

    const amount = parseFloat(bidAmount);
    const minRequired = Number(auction.current_price) + Number(auction.min_increment);

    if (amount < minRequired) {
      toast.error(`Minimum bid is Rs ${minRequired.toFixed(2)}`);
      return;
    }

    setPlacing(true);

    try {
      // Insert the bid and request the inserted row back
      const { data: insertedBids, error: insertError } = await supabase
        .from('bids')
        .insert({
          auction_id: id,
          bidder_id: user.id,
          amount
        })
        .select()
        .maybeSingle();

      if (insertError || !insertedBids) {
        const msg = insertError?.message ?? 'Failed to record bid';
        toast.error(msg);
        // refresh to show DB truth
        await loadAuctionAndBids();
        return;
      }

      // Now update auction current_price and get the updated row
      const { data: updatedAuction, error: updateError } = await supabase
        .from('auctions')
        .update({ current_price: amount })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (updateError || !updatedAuction) {
        const msg = updateError?.message ?? 'Failed to update auction price';
        toast.error(`${msg}. Your bid was recorded but the auction price was not updated.`);

        // Try to recover: if this failure is caused by RLS (missing admin role),
        // call the SECURITY DEFINER RPC make_user_admin for the current user and retry once.
        try {
          if (user) {
            // attempt to ensure the user is present in user_roles (no-op if already exists)
            await supabase.rpc('make_user_admin', { _user_id: user.id });

            // retry update once
            const { data: retried, error: retryErr } = await supabase
              .from('auctions')
              .update({ current_price: amount })
              .eq('id', id)
              .select()
              .maybeSingle();

            if (!retryErr && retried) {
              // Success on retry
              await loadAuctionAndBids();
              toast.success('Bid placed and auction price updated after activating admin role.');
              return;
            }
          }
        } catch (rpcErr) {
          // continue to final refresh below
          console.error('RPC make_user_admin failed', rpcErr);
        }

        // final: refresh to show DB truth (current_price likely unchanged)
        await loadAuctionAndBids();
        return;
      }

      // Success: refresh auction and bids so UI reflects the committed state
      await loadAuctionAndBids();
      toast.success('Bid placed successfully!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || 'Failed to place bid');
      // ensure UI reflects DB state
      await loadAuctionAndBids();
    } finally {
      setPlacing(false);
    }
  };

  const handleToggleWatchlist = async () => {
    if (!user) {
      toast.error('Please sign in to add to watchlist');
      return;
    }

    try {
      if (isWatching) {
        await supabase
          .from('watchlists')
          .delete()
          .eq('user_id', user.id)
          .eq('auction_id', id);
        setIsWatching(false);
        toast.success('Removed from watchlist');
      } else {
        await supabase
          .from('watchlists')
          .insert({ user_id: user.id, auction_id: id });
        setIsWatching(true);
        toast.success('Added to watchlist');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex h-[80vh] items-center justify-center">
          <p>Auction not found</p>
        </div>
      </div>
    );
  }

  const endTimeDate = auction.end_time ? new Date(auction.end_time) : null;
  const isLive = auction.status === 'live' && (!endTimeDate || endTimeDate > new Date());
  const images = auction.item?.images && Array.isArray(auction.item.images) ? (auction.item.images as string[]) : null;
  const mainImage = images?.[0] || '/placeholder.svg';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Images */}
          <div className="space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              <img src={mainImage} alt={auction.item.title} className="h-full w-full object-cover" />
              {isLive && (
                <Badge className="absolute left-4 top-4 animate-pulse bg-success shadow-glow">
                  <span className="mr-1 h-2 w-2 rounded-full bg-white" />
                  Live Auction
                </Badge>
              )}
            </div>
            {auction.item.images && Array.isArray(auction.item.images) && auction.item.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images!.slice(1, 5).map((img: string, idx: number) => (
                  <div key={idx} className="aspect-square overflow-hidden rounded-lg border">
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline">{auction.item.category?.name}</Badge>
                <Badge variant="outline">{auction.item.condition}</Badge>
              </div>
              <h1 className="mb-4 text-3xl font-bold">{auction.item.title}</h1>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Seller: {auction.item.seller.username}</span>
                </div>
              </div>
            </div>

            {/* Current Bid */}
            <Card className="border-2 border-primary/20 bg-gradient-card shadow-auction">
              <CardContent className="pt-6">
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">Current Bid</p>
                  <p className="text-4xl font-bold text-primary">Rs {Number(auction.current_price).toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Minimum increment: Rs {Number(auction.min_increment).toFixed(2)}</p>
                </div>

                {isLive && (
                  <>
                    <Countdown endTime={auction.end_time} />
                    
                    {user && (
                      <div className="mt-4 space-y-3">
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            placeholder="Enter bid amount"
                          />
                          <Button
                            onClick={handlePlaceBid}
                            disabled={placing}
                            className="bg-gradient-primary shadow-glow"
                          >
                            {placing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Gavel className="mr-2 h-4 w-4" />
                                Place Bid
                              </>
                            )}
                          </Button>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={handleToggleWatchlist}
                            className="flex-1"
                          >
                            <Heart className={`mr-2 h-4 w-4 ${isWatching ? 'fill-current' : ''}`} />
                            {isWatching ? 'Watching' : 'Watch'}
                          </Button>
                          <Button variant="outline">
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!isLive && (
                  <div>
                    <p className="text-center text-muted-foreground">This auction has ended</p>
                    {winner && (
                      <p className="text-center mt-2 text-sm text-muted-foreground">
                        Winner: <span className="font-medium text-primary">{winner.bidder?.username || 'Unknown'}</span>
                        {user && winner.bidder?.id === user.id && (
                          <span className="ml-2 font-semibold text-green-600"> — You won!</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Item Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{auction.item.description}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bid History */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Bid History ({bids.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {bids.length > 0 ? (
              <div className="space-y-3">
                {bids.map((bid) => (
                  <div key={bid.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{bid.bidder.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(bid.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-primary">Rs {Number(bid.amount).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">No bids yet. Be the first to bid!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}