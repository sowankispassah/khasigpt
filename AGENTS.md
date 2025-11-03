# Agens UI Standards

## 1. Persistent User Menu Dropdown
- The user menu dropdown must appear on **every page** of the application.  
- The dropdown should remain consistent in design, accessibility, and behavior across all routes.  

## 2. Hand Gesture Cursor for Clickable Elements
- All clickable elements (links, buttons, icons, etc.) must use a **hand gesture cursor** instead of the default pointer.  
- This ensures users can instantly recognize interactive elements.  

## 3. Visual Feedback on Actions
- When a user clicks any **button**, especially those that trigger updates, submissions, the interface must display a **loading indicator** (spinner, progress bar, or animation) without needing to refresh the page at all.  

## 4. Direct SQL Query for Manual Data Insertion
- When new data is created in the database, provide a **SQL query** to add to db instead of asking to run `npm exec tsx lib/db/migrate.ts`.  
