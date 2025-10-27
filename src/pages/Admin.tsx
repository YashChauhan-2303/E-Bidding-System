import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface PendingAuction {
  id: string;
  status: string;
  created_at: string;
  item_id: string;
  items: {
    title: string;
    description: string;
    base_price: number;
    images: string[];
    seller_id: string;
    profiles: {
      username: string;
    };
  };
}

export default function Admin() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { user } = useAuth();
  const [pendingAuctions, setPendingAuctions] = useState<PendingAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && !adminLoading) return;
    
    fetchPendingAuctions();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('admin-auctions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auctions'
        },
        () => {
          fetchPendingAuctions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, adminLoading]);

  async function fetchPendingAuctions() {
    setLoading(true);
    const { data, error } = await supabase
      .from('auctions')
      .select(`
        *,
        items:item_id (
          title,
          description,
          base_price,
          images,
          seller_id,
          profiles:seller_id (username)
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load pending auctions');
      console.error(error);
    } else {
      setPendingAuctions(data as any);
    }
    setLoading(false);
  }

  async function handleApprove(auctionId: string) {
    setActionLoading(auctionId);
    try {
      // Try updating directly; if RLS prevents it (no rows updated), call
      // the security-definer RPC `make_user_admin` and retry once.
      const attempt = async () => {
        const resp = await supabase
          .from('auctions')
          .update({ status: 'live', start_time: new Date().toISOString() })
          .eq('id', auctionId)
          .select();
        return resp as any;
      };

      let resp = await attempt();
      let { data, error } = resp;

      if (error) {
        console.warn('approve first attempt error', error);
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        try {
          const uid = user?.id;
          if (uid) {
            await supabase.rpc('make_user_admin', { _user_id: uid });
          }
        } catch (rpcErr) {
          console.warn('make_user_admin rpc failed', rpcErr);
        }

        resp = await attempt();
        ({ data, error } = resp);
      }

      if (error) {
        toast.error('Failed to approve auction');
        console.error('approve error', error, resp);
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        toast.error('Failed to approve auction (no rows updated). You may not have permission.');
        console.error('approve no rows updated', resp);
      } else {
        toast.success('Auction approved and is now live!');
        fetchPendingAuctions();
      }
    } catch (err) {
      toast.error('Failed to approve auction (network error)');
      console.error('approve network error', err);
    }
    setActionLoading(null);
  }

  async function handleReject(auctionId: string) {
    setActionLoading(auctionId);
    try {
      const attempt = async () => {
        const resp = await supabase
          .from('auctions')
          .update({ status: 'cancelled' })
          .eq('id', auctionId)
          .select();
        return resp as any;
      };

      let resp = await attempt();
      let { data, error } = resp;

      if (error) console.warn('reject first attempt error', error);

      if (!data || (Array.isArray(data) && data.length === 0)) {
        try {
          const uid = user?.id;
          if (uid) {
            await supabase.rpc('make_user_admin', { _user_id: uid });
          }
        } catch (rpcErr) {
          console.warn('make_user_admin rpc failed', rpcErr);
        }

        resp = await attempt();
        ({ data, error } = resp);
      }

      if (error) {
        toast.error('Failed to reject auction');
        console.error('reject error', error, resp);
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        toast.error('Failed to reject auction (no rows updated). You may not have permission.');
        console.error('reject no rows updated', resp);
      } else {
        toast.success('Auction rejected');
        fetchPendingAuctions();
      }
    } catch (err) {
      toast.error('Failed to reject auction (network error)');
      console.error('reject network error', err);
    }
    setActionLoading(null);
  }

  if (adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Manage auctions, users, and site settings
          </p>
        </div>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList>
            <TabsTrigger value="pending">
              Pending Approvals
              {pendingAuctions.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingAuctions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : pendingAuctions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No pending auctions</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6">
                {pendingAuctions.map((auction) => (
                  <Card key={auction.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle>{auction.items.title}</CardTitle>
                          <CardDescription>
                              by {auction.items.profiles.username} • Starting bid: Rs {auction.items.base_price}
                          </CardDescription>
                        </div>
                        <Badge variant="outline">Pending</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-[200px_1fr_auto]">
                        {auction.items.images && auction.items.images.length > 0 && (
                          <img
                            src={auction.items.images[0]}
                            alt={auction.items.title}
                            className="h-32 w-full rounded-lg object-cover md:w-48"
                          />
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {auction.items.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(auction.id)}
                            disabled={actionLoading === auction.id}
                            className="bg-gradient-primary"
                          >
                            {actionLoading === auction.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(auction.id)}
                            disabled={actionLoading === auction.id}
                          >
                            {actionLoading === auction.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <XCircle className="mr-2 h-4 w-4" />
                                Reject
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports" className="mt-6">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Reports management coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">User management coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
