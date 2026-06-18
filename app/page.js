import { Suspense } from 'react';
import QSDrawingAnalyser from '@/components/QSDrawingAnalyser';

export default function Home() {
  return (
    <Suspense>
      <QSDrawingAnalyser />
    </Suspense>
  );
}
