import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuctionCard } from '@/components/auction/AuctionCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Package, Gavel, Heart, ShoppingCart } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'selling');
  const [selling, setSelling] = useState<any[]>([]);
  const [bidding, setBidding] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'selling');
  }, [searchParams]);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      setLoading(true);

      // Fetch user's selling items
      const { data: sellingData } = await supabase
        .from('auctions')
        .select(`
          id,
          current_price,
          end_time,
          status,
          item:items!inner(
            id,
            title,
            images,
            seller_id
          )
        `)
        .eq('item.seller_id', user.id)
        .order('created_at', { ascending: false });

      if (sellingData) setSelling(sellingData);

      // Fetch user's bids
      const { data: bidsData } = await supabase
        .from('bids')
        .select(`
          auction_id,
          amount,
          auction:auctions!inner(
            id,
            current_price,
            end_time,
            status,
            item:items!inner(
              id,
              title,
              images
            )
          )
        `)
        .eq('bidder_id', user.id)
        .order('created_at', { ascending: false });

      if (bidsData) {
        const uniqueAuctions = Array.from(
          new Map(bidsData.map(bid => [bid.auction.id, bid.auction])).values()
        );
        setBidding(uniqueAuctions);
      }

      // Fetch watchlist
      const { data: watchlistData } = await supabase
        .from('watchlists')
        .select(`
          auction:auctions!inner(
            id,
            current_price,
            end_time,
            status,
            item:items!inner(
              id,
              title,
              images
            )
          )
        `)
        .eq('user_id', user.id);

      if (watchlistData) {
        setWatchlist(watchlistData.map(w => w.auction));
      }

      // Fetch orders
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          *,
          auction:auctions!inner(
            item:items(title, images)
          )
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (ordersData) setOrders(ordersData);

      setLoading(false);
    }

    fetchData();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-8">
        <h1 className="mb-8 text-4xl font-bold">My Dashboard</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="selling" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Selling
            </TabsTrigger>
            <TabsTrigger value="bids" className="flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              My Bids
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Watchlist
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Orders
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <TabsContent value="selling" className="mt-6">
                {selling.length > 0 ? (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {selling.map((auction) => (
                      <AuctionCard
                        key={auction.id}
                        id={auction.id}
                        title={auction.item.title}
                        currentPrice={Number(auction.current_price)}
                        endTime={auction.end_time}
                        images={auction.item.images || []}
                        status={auction.status}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No items listed yet. Create your first listing!
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="bids" className="mt-6">
                {bidding.length > 0 ? (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {bidding.map((auction: any) => (
                      <AuctionCard
                        key={auction.id}
                        id={auction.id}
                        title={auction.item.title}
                        currentPrice={Number(auction.current_price)}
                        endTime={auction.end_time}
                        images={auction.item.images || []}
                        status={auction.status}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      You haven't placed any bids yet
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="watchlist" className="mt-6">
                {watchlist.length > 0 ? (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {watchlist.map((auction: any) => (
                      <AuctionCard
                        key={auction.id}
                        id={auction.id}
                        title={auction.item.title}
                        currentPrice={Number(auction.current_price)}
                        endTime={auction.end_time}
                        images={auction.item.images || []}
                        status={auction.status}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      Your watchlist is empty
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="orders" className="mt-6">
                {orders.length > 0 ? (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <Card key={order.id}>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Order #{order.id.substring(0, 8)}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{order.auction?.item?.title}</p>
                              <p className="text-sm text-muted-foreground">
                                Status: <span className="capitalize">{order.status.replace('_', ' ')}</span>
                              </p>
                            </div>
                            <p className="text-2xl font-bold text-primary">
                              ${Number(order.total).toFixed(2)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No orders yet
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}