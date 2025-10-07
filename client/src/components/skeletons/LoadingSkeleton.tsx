import React from 'react';

interface LoadingSkeletonProps {
  className?: string;
  height?: string;
  width?: string;
  rounded?: boolean;
  variant?: 'default' | 'text' | 'circular' | 'rectangular';
}

export function LoadingSkeleton({ 
  className = '', 
  height = 'h-4', 
  width = 'w-full',
  rounded = true,
  variant = 'default'
}: LoadingSkeletonProps) {
  const baseClasses = 'bg-gray-200 animate-pulse';
  
  const variantClasses = {
    default: rounded ? 'rounded' : '',
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none'
  };

  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${height} ${width} ${className}`}
    />
  );
}

// Skeleton components for specific use cases
export function PlayerRowSkeleton() {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-3 px-2 sticky left-0 bg-white">
        <div className="flex items-center gap-3">
          <LoadingSkeleton variant="circular" height="h-8" width="w-8" />
          <div className="space-y-1">
            <LoadingSkeleton height="h-4" width="w-24" />
            <LoadingSkeleton height="h-3" width="w-16" />
          </div>
        </div>
      </td>
      {/* Stats columns */}
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i} className="py-3 px-2 text-center">
          <LoadingSkeleton height="h-4" width="w-8" className="mx-auto" />
        </td>
      ))}
    </tr>
  );
}

export function StandingsRowSkeleton() {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-3 px-2">
        <LoadingSkeleton height="h-4" width="w-6" />
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <LoadingSkeleton variant="circular" height="h-6" width="w-6" />
          <LoadingSkeleton height="h-4" width="w-20" />
        </div>
      </td>
      {/* Other columns */}
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="py-3 px-2 text-center">
          <LoadingSkeleton height="h-4" width="w-12" className="mx-auto" />
        </td>
      ))}
    </tr>
  );
}

export function LeaderCardSkeleton() {
  return (
    <div className="bg-gray-50 rounded-lg p-4 shadow-inner">
      <LoadingSkeleton height="h-4" width="w-24" className="mx-auto mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <LoadingSkeleton height="h-3" width="w-16" />
            <LoadingSkeleton height="h-3" width="w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="bg-white rounded-lg p-4 shadow border">
      <div className="flex justify-between items-center mb-3">
        <LoadingSkeleton height="h-3" width="w-20" />
        <LoadingSkeleton height="h-3" width="w-16" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LoadingSkeleton variant="circular" height="h-8" width="w-8" />
          <LoadingSkeleton height="h-4" width="w-16" />
        </div>
        <LoadingSkeleton height="h-6" width="w-12" />
        <div className="flex items-center gap-2">
          <LoadingSkeleton height="h-4" width="w-16" />
          <LoadingSkeleton variant="circular" height="h-8" width="w-8" />
        </div>
      </div>
    </div>
  );
}

export function ChatbotSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <LoadingSkeleton variant="circular" height="h-8" width="w-8" />
        <div className="flex-1 space-y-2">
          <LoadingSkeleton height="h-4" width="w-3/4" />
          <LoadingSkeleton height="h-4" width="w-1/2" />
        </div>
      </div>
      <div className="flex items-start gap-3">
        <LoadingSkeleton variant="circular" height="h-8" width="w-8" />
        <div className="flex-1 space-y-2">
          <LoadingSkeleton height="h-4" width="w-full" />
          <LoadingSkeleton height="h-4" width="w-5/6" />
          <LoadingSkeleton height="h-4" width="w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center gap-4 mb-6">
        <LoadingSkeleton variant="circular" height="h-16" width="w-16" />
        <div className="space-y-2">
          <LoadingSkeleton height="h-6" width="w-32" />
          <LoadingSkeleton height="h-4" width="w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="text-center">
            <LoadingSkeleton height="h-8" width="w-12" className="mx-auto mb-1" />
            <LoadingSkeleton height="h-3" width="w-16" className="mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableHeaderSkeleton({ columns }: { columns: number }) {
  return (
    <thead>
      <tr className="border-b border-gray-200">
        {Array.from({ length: columns }).map((_, i) => (
          <th key={i} className="py-3 px-2">
            <LoadingSkeleton height="h-4" width="w-16" className="mx-auto" />
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function CompactLoadingSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
  );
}