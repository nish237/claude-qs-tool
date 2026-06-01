import './globals.css';

export const metadata = {
  title: 'QuantSurv AI — Drawing Analyser',
  description: 'AI-powered quantity surveying. Upload a construction drawing and get an instant takeoff in seconds.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%23f59e0b'/><text y='.9em' font-size='80' font-family='system-ui' font-weight='900' fill='%230d1b3e'>QS</text></svg>",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
