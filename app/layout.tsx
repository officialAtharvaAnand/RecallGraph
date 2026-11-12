import './style.css';
export const metadata = {
  title: 'RecallGraph | Failure intelligence',
  description: 'Find recurring incidents and their shared failure signals',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
