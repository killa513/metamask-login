# Copilot Instructions for MetaMask Login Project

## Project Overview
This is a React + TypeScript project built with Vite that implements a MetaMask wallet integration for Web3 authentication. The project focuses on providing a clean, user-friendly interface for connecting to MetaMask with comprehensive logging capabilities.

## Key Components and Patterns

### MetaMask Integration
- Main integration logic is in `src/MetamaskLoginPage.tsx`
- Uses `window.ethereum` provider for wallet interactions
- Handles both desktop (browser extension) and mobile (deep linking) scenarios
- Key methods:
  - `connectMetaMask()`: Main wallet connection flow
  - `fetchBalance()`: Gets user's ETH balance
  - `disconnect()`: Handles wallet disconnection

### Logging System
The project implements a sophisticated logging system with these characteristics:
- Buffered client-side logging with server sync
- Exponential backoff for failed log submissions
- Supports multiple log levels (debug, info, warn, error)
- Log entries include timestamps, levels, tags, and metadata
- Logs are displayed in real-time in the UI

Example log pattern:
```typescript
logger.info("User connected via MetaMask", "auth", {
  account: address,
  chainId: chain,
  // Additional metadata
});
```

### UI Conventions
- Uses Tailwind CSS for styling
- Consistent color scheme using white/black with opacity variants
- Responsive grid layout (single column on mobile, two columns on desktop)
- Components follow a gradient-based theme with glassmorphism effects

## Development Workflow

### Setup and Installation
1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

### Build and Deploy
```bash
npm run build
npm run preview  # Preview production build
```

### TypeScript Conventions
- Use strict type checking
- Define interfaces for structured data (see `LogEntry` interface)
- Prefer explicit typing over inference for public APIs
- Handle Web3 types carefully (BigInt conversions, optional chaining for provider)

### Testing Considerations
- Test wallet connection with both MetaMask extension and mobile deep links
- Verify logging system with network failures (logs should buffer and retry)
- Test chain switching and account change scenarios
- Ensure proper cleanup of event listeners in useEffect hooks

## Integration Points

### Backend API
The logging system expects a POST endpoint at `/api/logs` that accepts:
```typescript
{
  logs: Array<{
    ts: string;         // ISO timestamp
    level: LogLevel;    // "debug" | "info" | "warn" | "error"
    tag?: string;       // Optional context tag
    message: string;    // Log message
    meta?: Record<string, any>; // Optional metadata
  }>
}
```

### MetaMask Provider
- Project assumes MetaMask provider is available as `window.ethereum`
- Handles provider events:
  - `accountsChanged`: User switched accounts
  - `chainChanged`: Network/chain changed
  - `disconnect`: Wallet disconnected

## Common Tasks

### Adding New Features
1. For new wallet interactions, add methods to `MetamaskLoginPage.tsx`
2. Use the logging system to track user actions and state changes
3. Follow existing patterns for error handling and user feedback
4. Add TypeScript interfaces for any new data structures

### Modifying the Logger
The logger is created in `MetamaskLoginPage.tsx` with these default settings:
```typescript
const logger = createLogger({ 
  endpoint: "/api/logs", 
  flushIntervalMs: 1500 
});
```

Adjust these parameters based on your needs for log buffering and sync frequency.