import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { AuctionCard } from '@/components/auction/AuctionCard';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Gavel, Shield, TrendingUp, Users } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const [featuredAuctions, setFeaturedAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeaturedAuctions() {
      const { data, error } = await supabase
        .from('auctions')
        .select(`
          id,
          current_price,
          end_time,
          status,
          item:items!inner(
            id,
            title,
            images
          )
        `)
        .eq('status', 'live')
        .order('end_time', { ascending: true })
        .limit(6);

      if (!error && data) {
        setFeaturedAuctions(data);
      }
      setLoading(false);
    }

    fetchFeaturedAuctions();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-hero py-20 md:py-32">
        <div className="container relative z-10">
          <div className="mx-auto max-w-3xl text-center text-white">
            <h1 className="mb-6 text-5xl font-bold leading-tight md:text-6xl lg:text-7xl">
              Discover Treasures,
              <br />
              <span className="bg-gradient-to-r from-white to-primary-glow bg-clip-text text-transparent">
                Win Auctions
              </span>
            </h1>
            <p className="mb-8 text-lg text-white/90 md:text-xl">
              Join thousands of collectors and sellers in the most exciting online auction platform.
              Real-time bidding, secure transactions, amazing finds.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/auctions">
                <Button size="lg" className="bg-white text-primary shadow-glow hover:bg-white/90">
                  Start Browsing
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/auth/sign-up">
                <Button size="lg" variant="outline" className="border-white bg-white/10 text-white backdrop-blur-sm hover:bg-white/20">
                  <Gavel className="mr-2 h-5 w-5" />
                  Join Now
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
      </section>

      {/* Features */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Real-Time Bidding</h3>
              <p className="text-muted-foreground">
                Watch bids update instantly and never miss your chance to win
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Secure & Trusted</h3>
              <p className="text-muted-foreground">
                Protected transactions and verified sellers for peace of mind
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary">
                <Users className="h-8 w-8 text-white" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Active Community</h3>
              <p className="text-muted-foreground">
                Join thousands of passionate collectors and sellers worldwide
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Auctions */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container">
          <div className="mb-12 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold md:text-4xl">Live Auctions</h2>
              <p className="mt-2 text-muted-foreground">Don't miss these hot items ending soon</p>
            </div>
            <Link to="/auctions">
              <Button variant="outline">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : featuredAuctions.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredAuctions.map((auction) => (
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
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No live auctions at the moment. Check back soon!</p>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="rounded-2xl bg-gradient-primary p-12 text-center text-white shadow-auction">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Ready to Start Selling?</h2>
            <p className="mb-8 text-lg text-white/90">
              List your items, reach thousands of buyers, and get the best value
            </p>
            <Link to="/sell">
              <Button size="lg" className="bg-white text-primary shadow-glow hover:bg-white/90">
                <Gavel className="mr-2 h-5 w-5" />
                List Your First Item
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© 2025 BidSpark. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}