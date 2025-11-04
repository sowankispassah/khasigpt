# Agens UI Standards

## 1. Persistent User Menu Dropdown
- The user menu dropdown must appear on **every page** of the application.  
- The dropdown should remain consistent in design, accessibility, and behavior across all routes.  

## 2. Hand Gesture Cursor for Clickable Elements
- All clickable elements (links, buttons, icons, etc.) must use a **hand gesture cursor** instead of the default pointer.  
- This ensures users can instantly recognize interactive elements.  

## 3. Visual Feedback on Actions
- When a user clicks any **button**, especially those that trigger updates or submissions, the interface must display a **loading indicator** (spinner, progress bar, or animation) without needing to refresh the page.  

## 4. Direct SQL Query for Manual Data Insertion
- When new data is created in the database, provide a **SQL query** for manual insertion instead of running `npm exec tsx lib/db/migrate.ts`.  

## 5. Performance & Speed Optimization (Next.js)
- The site must focus on **speed, responsiveness, and efficient rendering** across all pages.  
- Use **Next.js Image Optimization** (`next/image`) to automatically compress and serve responsive images.  
- Apply **code-splitting** and **dynamic imports** (`next/dynamic`) to load heavy components only when needed.  
- Implement **Static Site Generation (SSG)** or **Incremental Static Regeneration (ISR)** wherever possible for faster delivery.  
- Use **React.memo**, **useMemo**, and **useCallback** to prevent unnecessary re-renders of components.  
- Leverage **Next.js built-in caching** and **Edge Runtime** for low-latency responses.  
- Avoid blocking JavaScript operations and minimize external dependencies.  
- Test performance using **Lighthouse** and ensure Core Web Vitals (LCP, FID, CLS) remain in optimal range.  

## 6. Security & Best Practices
- Always store sensitive credentials (API keys, database URLs, tokens) in **.env** files and **never commit** them to Git.  
- Use **Next.js Environment Variables** (`process.env`) only on the server side for secrets.  
- Sanitize all user input before storing or rendering to prevent **XSS** and **SQL injection**.  
- Use **HTTPS** and secure headers (e.g., `Strict-Transport-Security`, `Content-Security-Policy`).  
- Avoid exposing internal APIs or private routes to the client. Protect them via **middleware** or **server-side checks**.  
- Regularly update dependencies and run `npm audit` to fix vulnerabilities.  
- Enable **rate limiting** and **authentication checks** on API routes.  
- Do not log sensitive user data to the console or store it in local/session storage.  
- Use **Supabase RLS (Row-Level Security)** and **policies** where applicable for database protection.  
- Review and validate all user-facing forms and actions to ensure data integrity and security compliance.  
