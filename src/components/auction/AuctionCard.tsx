import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Eye, Gavel } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AuctionCardProps {
  id: string;
  title: string;
  currentPrice: number;
  endTime: string;
  images: string[];
  status: string;
  bidCount?: number;
  winner?: string | null;
}

export function AuctionCard({
  id,
  title,
  currentPrice,
  endTime,
  images,
  status,
  bidCount = 0,
  winner = null,
}: AuctionCardProps) {
  const imageUrl = images && images.length > 0 ? images[0] : '/placeholder.svg';
  const endDate = endTime ? new Date(endTime) : null;
  const now = Date.now();
  const isLive = status === 'live';
  const timeLeft = endDate ? endDate.getTime() - now : Infinity;
  const isEnding = isLive && timeLeft < 3600000 && timeLeft > 0; // Less than 1 hour and still live
  const isRecentlyEnded = endDate ? now > endDate.getTime() && now - endDate.getTime() <= 3 * 60 * 60 * 1000 : false; // ended within last 3 hours

  return (
    <Link to={`/auctions/${id}`}>
      <Card className="group overflow-hidden transition-all hover:shadow-auction">
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          {isLive && (
            <Badge className="absolute left-2 top-2 animate-pulse bg-success shadow-glow">
              <span className="mr-1 h-2 w-2 rounded-full bg-white" />
              Live
            </Badge>
          )}
          {isEnding && (
            <Badge variant="destructive" className="absolute right-2 top-2">
              Ending Soon
            </Badge>
          )}
          {isRecentlyEnded && (
            <Badge variant="outline" className="absolute right-2 top-2">
              Ended
            </Badge>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="mb-2 line-clamp-2 font-semibold">{title}</h3>
          {isRecentlyEnded && winner && (
            <p className="mb-2 text-sm text-muted-foreground">Winner: <span className="font-medium text-primary">{winner}</span></p>
          )}
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Current Bid</p>
              <p className="text-2xl font-bold text-primary">Rs {currentPrice.toFixed(2)}</p>
            </div>
            <div className="text-right">
              {endDate && endDate.getTime() > now ? (
                <>
                  <p className="text-xs text-muted-foreground">Ends in</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(endDate)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Ended</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {endDate ? formatDistanceToNow(endDate, { addSuffix: true }) : '—'}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Gavel className="h-3 w-3" />
              {bidCount} bids
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              View Details
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}