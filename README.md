# Deal ↔ Quote Sync Service

## Overview

This service keeps a HubSpot Deal fully synchronized with its associated Quote(s).

In this use case, it is common to have:

- Multiple quotes on the same deal
- Different versions, configurations, or add-ons
- More than one quote marked as accepted / won

The goal is to ensure that the Deal **Amount and Line Items always reflect the correct financial state** based on accepted (won) quotes.

---

## Business Logic

### When One or More Quotes Are Marked as Won

If a `QUOTE PROPERTY CHANGE` event indicates that a quote is marked as **Won** (`kystgjerdet_selected_offer_status`):

- The Deal `Amount` becomes the **sum of all Won quotes**
- The Deal `Line Items` become the **combined line items of all Won quotes**
- Any existing Deal line items are removed before rebuilding

If multiple quotes are marked as Won, their values are combined.

---

### When No Quote Is Won

If:

- No quote is marked as Won
- There are still associated quotes

Then:

- The Deal `Amount` is set to the **average of all associated quote amounts**

This prevents the Deal from defaulting to the last published quote.

---

### Live Update Scenarios

The Deal automatically updates when:

- A quote is marked/unmarked as Won
- A quote is deleted
- A line item is added/removed from a quote
- A line item’s `price`, `quantity`, `discount`, or `hs_discount_percentage` changes
- Associations between quote/deal/line items change

The Deal is always recalculated from source-of-truth data.

---

# Installation & Setup

## 1. Install Dependencies

```bash
npm install
```

# Configuration (Environment Variables)

## Environment Variables

| Variable                    | Description                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| `APP_MODE`                  | Application mode: `DEVELOPMENT` or `PRODUCTION`                                 |
| `SAMPLE_DEAL_ID`            | Optional deal ID used for controlled testing and APP_MODE is set to DEVELOPMENT |
| `HUBSPOT_PRIVATE_APP_TOKEN` | HubSpot Private App token for API authentication                                |

---

# Running the Application

Start the development server:

Ensure environment variables are properly loaded before running the server.

---

# Architecture

The project follows a standard Node.js + Express MVP-inspired structure.

Typical folder structure:

### Core Components

- **Route Layer** – Handles incoming webhook requests
- **Controller Layer** – Orchestrates event processing
- **Service Layer** – Contains business logic and HubSpot API interactions
- **Utilities** – Helper functions and event normalization
- **Global Error Handler** – Centralized error management

---

# Webhook Endpoint

The service exposes a single endpoint: POST https://<render-domain>/workflow/quote-deal-sync

This endpoint processes all relevant HubSpot workflow events related to:

- Quotes
- Deals
- Line Items
- Associations

The endpoint is designed to be idempotent and safe for repeated event triggers.

---

# Data Flow

The synchronization process follows this sequence:

HubSpot Event Fires
↓
Normalize / Build Internal Event Object
↓
Lookup Quote ID and Deal ID
↓
Fetch All Associated Quotes
↓
Determine Won Quotes
↓
IF Won Quotes Exist:

- Sum All Won Quote Amounts
- Remove All Deal Line Items
- Rebuild Line Items From Won Quotes
  ELSE:
- Calculate Average of All Quote Amounts
  ↓
  Update Deal Amount

# 📡 Supported HubSpot Events

### Quote Events

- `QUOTE PROPERTY CHANGE (kystgjerdet_selected_offer_status)`
- `QUOTE DELETION`
- `QUOTE TO DEAL ASSOCIATION`

### Line Item Events

- `LINE ITEMS TO DEAL ASSOCIATION`
- `LINE ITEMS TO QUOTE ASSOCIATION`
- `LINE ITEM IN QUOTE DELETION`
- `LINE ITEM PROPERTY CHANGE`
  - `price`
  - `quantity`
  - `discount`
  - `hs_discount_percentage`

These events ensure real-time synchronization between Quotes and Deals.

---

# Error Handling

- Centralized global error handler
- Structured logging
- Graceful failure handling for API errors
- Prevents partial updates
- Always recalculates from a clean source-of-truth state

The system removes and rebuilds Deal line items instead of performing incremental mutations to avoid data drift.

---

# Deployment

The application is hosted on Render.

## Production Configuration

Set: APP_MODE=PRODUCTION

Make sure the endpoint is publicly accessible and secured appropriately.
