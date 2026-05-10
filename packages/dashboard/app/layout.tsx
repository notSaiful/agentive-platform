export const metadata = {
  title: 'Agentive Dashboard',
  description: 'CRE Agent Performance Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
