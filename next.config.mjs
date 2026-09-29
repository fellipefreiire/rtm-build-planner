/** @type {import('next').NextConfig} */
export default {
  output: 'export',          // static site: no server, builds live in the browser
  reactStrictMode: true,
  images: { unoptimized: true },
}
