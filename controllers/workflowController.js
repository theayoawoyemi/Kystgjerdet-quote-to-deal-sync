const hubspot = require("@hubspot/api-client");

// App Mode
const APP_MODE = process.env.APP_MODE || "DEVELOPMENT";
const SAMPLE_DEAL_ID = process.env.SAMPLE_DEAL_ID;

// HubSpot Private App Token
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

// HubSpot Initialization
const hubspotClient = new hubspot.Client({ accessToken: token });

// Send response
const sendResponse = (res, payload, message = "Success") => {
  res.status(200).json({
    status: "success",
    message,
    payload: payload || undefined,
  });
};

// Get deal from quote
const getDeal = async (quoteId) => {
  try {
    // Get associated deals
    const associationResponse =
      await hubspotClient.crm.associations.v4.basicApi.getPage(
        "quotes",
        quoteId,
        "deals",
      );

    // Check if there is an association
    if (!associationResponse.results.length) {
      const errMsg = "No deal associated";
      throw new Error(errMsg);
    }

    // Extract deal ID from the first association
    const dealId = associationResponse.results[0].toObjectId;

    // Fetch deal details
    const deal = await hubspotClient.crm.deals.basicApi.getById(dealId, [
      "dealname",
      "amount",
      "pipeline",
      "dealstage",
    ]);

    return deal;
  } catch (error) {
    throw error;
  }
};

// Get all deal quotes
const getAllDealQuotes = async (dealId) => {
  try {
    // Get associated quote IDs
    const associationResponse =
      await hubspotClient.crm.associations.v4.basicApi.getPage(
        "deals",
        dealId,
        "quotes",
      );

    // Check if there are associated quotes in the response
    if (!associationResponse.results.length) {
      return [];
    }

    // Map to object IDs to quote IDs
    const quoteIds = associationResponse.results.map(
      (result) => result.toObjectId,
    );

    // Batch fetch quote details
    const batchResponse = await hubspotClient.crm.quotes.batchApi.read({
      inputs: quoteIds.map((id) => ({ id })),
      properties: [
        "hs_title",
        "hs_status",
        "hs_expiration_date",
        "hs_quote_amount",
        "kystgjerdet_selected_offer_status",
      ],
    });

    // Check if there are quotes returned from deal
    if (!batchResponse.results.length) return [];
    return batchResponse.results;
  } catch (error) {
    throw error;
  }
};

// Filter and return quotes that has the kystgjerdet_selected_offer_status = true;
const filterQuotes = (quotes) => {
  if (!Array.isArray(quotes)) return [];
  return quotes.filter((quote) => {
    if (quote.properties.kystgjerdet_selected_offer_status === "true")
      return true;
    return false;
  });
};

// Get accepted quotes IDs
const getAcceptedQuotesIds = (quotes) => {
  return quotes.map((quote) => quote.id);
};

// Get all line items for all quotes from deal
const getAllLineItems = async (quoteIds) => {
  try {
    if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
      return [];
    }

    const allLineItemIds = [];

    //  Get line item associations for each quote
    for (const quoteId of quoteIds) {
      const associationResponse =
        await hubspotClient.crm.associations.v4.basicApi.getPage(
          "quotes",
          quoteId,
          "line_items",
        );

      const lineItemIds = associationResponse.results.map(
        (result) => result.toObjectId,
      );

      allLineItemIds.push(...lineItemIds);
    }

    // Check if there are associated lineItems from quote
    if (!allLineItemIds.length)
      throw new Error("No line items found on deal quotes");

    // Batch fetch line item details
    const batchResponse = await hubspotClient.crm.lineItems.batchApi.read({
      inputs: allLineItemIds.map((id) => ({ id })),
      properties: [
        "name",
        "price",
        "quantity",
        "amount",
        "discount",
        "hs_discount_percentage",
        "tax",
        "hs_product_id",
      ],
    });

    return batchResponse.results;
  } catch (error) {
    throw error;
  }
};

// Remove all line items from deal
const removeAllLineItemsFromDeal = async (dealId) => {
  try {
    // Get associated line items
    const associationResponse =
      await hubspotClient.crm.associations.v4.basicApi.getPage(
        "deals",
        dealId,
        "line_items",
      );

    if (!associationResponse.results.length) return [];

    const lineItemIds = associationResponse.results.map((r) => r.toObjectId);

    const batchArchiveRequest = {
      inputs: lineItemIds.map((id) => ({
        _from: { id: dealId },
        to: [{ id }],
      })),
    };

    // Purge line items from deal
    await hubspotClient.crm.associations.v4.batchApi.archive(
      "deals",
      "line_items",
      batchArchiveRequest,
    );
    return lineItemIds;
  } catch (error) {
    throw error;
  }
};

// Merge Line Items that has the same name, id, quantity and price
const mergeLineItems = (lineItems) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return [];
  }

  const map = new Map();

  for (const item of lineItems) {
    const props = item.properties;

    const name = props.name || "";
    const price = parseFloat(props.price || 0);
    const quantity = parseFloat(props.quantity || 0);
    const discount = parseFloat(props.discount || 0);
    const discountPercentage = parseFloat(props.hs_discount_percentage || 0);
    const productId = props.hs_product_id || "";

    // Key includes BOTH discount types separately
    const key = `${productId}__${name}__${price}__${discount}__${discountPercentage}`;

    if (!map.has(key)) {
      map.set(key, {
        hs_product_id: productId,
        name,
        price,
        discount,
        hs_discount_percentage: discountPercentage,
        quantity: 0,
      });
    }

    const existing = map.get(key);

    existing.quantity += quantity;
  }

  // Convert back to array
  return Array.from(map.values()).map((item) => ({
    properties: {
      hs_product_id: item.hs_product_id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      discount: item.discount || null,
      hs_discount_percentage: item.hs_discount_percentage || null,
    },
  }));
};

// Associate line items to the deal;
const createDealLineItemsFromQuote = async (lineItems, dealId) => {
  const quoteLineItems = mergeLineItems(lineItems);

  try {
    if (!Array.isArray(quoteLineItems) || !quoteLineItems.length) {
      throw new Error("No line items to associated to deal!");
    }

    // Build payload for batch association
    const inputs = quoteLineItems.map((item) => ({
      properties: {
        name: item.properties.name,
        price: item.properties.price,
        quantity: item.properties.quantity,
        discount: item.properties.discount || undefined,
        hs_discount_percentage:
          item.properties.hs_discount_percentage || undefined,
        hs_product_id: item.properties.hs_product_id,
      },
      associations: [
        {
          to: { id: dealId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 20,
            },
          ],
        },
      ],
    }));

    const response = await hubspotClient.crm.lineItems.batchApi.create({
      inputs,
    });

    if (!response.results.length)
      throw new Error("No deal line items was associated!");
  } catch (error) {
    throw error;
  }
};

// Calculate deal amount
const calculateDealAmount = (quotes) => {
  let amount = 0;
  quotes.forEach((quote) => {
    amount += parseFloat(quote.properties.hs_quote_amount);
  });

  return amount;
};

// Calculate Average Deal Amount
const calculateAverageDealAmount = (quotes) => {
  let amount = 0;
  quotes.forEach((quote) => {
    amount += parseFloat(quote.properties.hs_quote_amount);
  });

  if (amount) amount = amount / quotes.length;
  return amount;
};

// Update deal amount
const updateDealAmount = async (dealId, totalAmount) => {
  try {
    await hubspotClient.crm.deals.basicApi.update(dealId, {
      properties: {
        amount: totalAmount.toFixed(2),
      },
    });
    if (APP_MODE === "DEVELOPMENT")
      console.log(`Deal ${dealId} updated to amount: ${totalAmount}`);
  } catch (error) {
    if (APP_MODE === "DEVELOPMENT")
      console.error("Failed updating deal amount:", error.message);
    throw error;
  }
};

// Check if event is property change
const isPropertyChange = (event, eventPropertyName) => {
  const eventType = "object.propertyChange";
  const propertyName = eventPropertyName || "kystgjerdet_selected_offer_status";
  if (
    event.subscriptionType === eventType &&
    event.propertyName === propertyName
  )
    return true;
  return false;
};

// Check if there is quote deletion so it recalculates;
const isQuoteDeletion = (event) => {
  if (
    event.subscriptionType === "object.associationChange" &&
    event.associationType === "QUOTE_TO_DEAL" &&
    event.changeSource === "OBJECT_DELETION" &&
    event.associationCategory === "HUBSPOT_DEFINED"
  )
    return true;
  return false;
};

// Check if there is Quote to Deal Association
const isQuoteToDeal = (event) => {
  if (
    event.subscriptionType === "object.associationChange" &&
    event.associationType === "QUOTE_TO_DEAL" &&
    event.changeSource === "USER" &&
    event.associationCategory === "HUBSPOT_DEFINED"
  )
    return true;
  return false;
};

// Check if there is line items to deal
const isLineItemToDeal = (event) => {
  if (
    event.subscriptionType === "object.associationChange" &&
    event.associationType === "LINE_ITEM_TO_DEAL" &&
    event.changeSource === "USER" &&
    event.associationCategory === "HUBSPOT_DEFINED"
  )
    return true;
  return false;
};

// Line item to quote
const isLineItemToQuote = (event) => {
  if (
    event.subscriptionType === "object.associationChange" &&
    event.associationType === "LINE_ITEM_TO_QUOTE" &&
    event.changeSource === "USER" &&
    event.associationCategory === "HUBSPOT_DEFINED"
  )
    return true;
  return false;
};

// Line Item to Quote Removal
const isLineItemToQuoteDeletion = (event) => {
  if (
    event.subscriptionType === "object.associationChange" &&
    event.associationType === "LINE_ITEM_TO_QUOTE" &&
    event.changeSource === "OBJECT_DELETION" &&
    event.associationCategory === "HUBSPOT_DEFINED"
  )
    return true;
  return false;
};

// Line Item Property Change
const isLineItemPropertyChange = (event) => {
  const propertyNames = [
    "price",
    "discount",
    "quantity",
    "hs_discount_percentage",
  ];

  const subscriptionTypes = [
    "object.propertyChange",
    "line_item.propertyChange",
  ];

  if (
    subscriptionTypes.includes(event.subscriptionType) &&
    event.changeSource === "QUOTES" &&
    propertyNames.includes(event.propertyName)
  )
    return true;
  return false;
};

// Get main event - avoid duplicate event
const uniqueEvent = (events, filter) => {
  if (!events.length) return;
  const filteredEvents = events.filter((e) => filter(e));
  if (!filteredEvents.length) return;

  return filteredEvents[0];
};

// Build event - filter out events that are not necessary to increase efficiency.
const buildEvent = (events) => {
  if (!events || !Array.isArray(events) || !events.length) return [];

  const filteredEvents = [];

  if (uniqueEvent(events, isPropertyChange))
    filteredEvents.push(uniqueEvent(events, isPropertyChange));

  if (uniqueEvent(events, isQuoteDeletion))
    filteredEvents.push(uniqueEvent(events, isQuoteDeletion));

  if (uniqueEvent(events, isQuoteToDeal))
    filteredEvents.push(uniqueEvent(events, isQuoteToDeal));

  if (uniqueEvent(events, isLineItemToDeal))
    filteredEvents.push(uniqueEvent(events, isLineItemToDeal));

  if (uniqueEvent(events, isLineItemToQuote))
    filteredEvents.push(uniqueEvent(events, isLineItemToQuote));

  if (uniqueEvent(events, isLineItemToQuoteDeletion))
    filteredEvents.push(uniqueEvent(events, isLineItemToQuoteDeletion));

  if (uniqueEvent(events, isLineItemPropertyChange))
    filteredEvents.push(uniqueEvent(events, isLineItemPropertyChange));

  return filteredEvents;
};

const getQuoteIdFromLineItem = async (lineItemId) => {
  const response = await hubspotClient.crm.associations.v4.basicApi.getPage(
    "line_items",
    lineItemId,
    "quotes",
  );

  return response.results?.[0]?.toObjectId || null;
};

// Quote to Deal Handler
exports.sync = async (req, res, next) => {
  let resData = [];

  // Filter out unwanted event and make event unique
  const events = buildEvent(req.body);

  resData = req.body;

  // Check request body if there is an event;
  if (!events || !Array.isArray(events) || !events.length)
    return sendResponse(res, resData, "No event data");

  for (const event of events) {
    try {
      let quoteId,
        dealId,
        quotes,
        lineItemsUpdate = true;

      // Property change and property name is "kystgjerdet_selected_offer_status"
      if (isPropertyChange(event)) {
        quoteId = event.objectId;
      }

      // Quote deletion event
      else if (isQuoteDeletion(event) || isQuoteToDeal(event)) {
        quoteId = event.fromObjectId;
        dealId = event.toObjectId;
      }

      // Line Items to Deal Association
      else if (isLineItemToDeal(event)) {
        dealId = event.toObjectId;
      }

      // Line Item to Quote Association
      else if (isLineItemToQuote(event) || isLineItemToQuoteDeletion(event)) {
        quoteId = event.toObjectId;
      }

      // Line Item Property Change
      else if (isLineItemPropertyChange(event)) {
        if (event.objectId) {
          quoteId = await getQuoteIdFromLineItem(event.objectId);
        }
      }

      // Fetch the associated deal data
      if (!dealId && quoteId) {
        const deal = await getDeal(quoteId);
        dealId = deal.id;
      }

      if (!dealId) throw new Error("Error getting associated deal ID");

      // Enable testing for a specific deal
      // console.log(SAMPLE_DEAL_ID);
      // console.log(dealId);
      // console.log(parseInt(SAMPLE_DEAL_ID) === parseInt(dealId.toString()));

      if (APP_MODE === "DEVELOPMENT")
        if (dealId.toString() !== SAMPLE_DEAL_ID.toString())
          throw new Error("Error! Deal ID does not match testing deal ID");

      // Fetch all the quotes on the deal
      quotes = await getAllDealQuotes(dealId);

      // Check if there is any quote on deal;
      if (!quotes.length) {
        await updateDealAmount(dealId, 0);
        await removeAllLineItemsFromDeal(dealId);
        throw new Error("No quotes on deal");
      }

      // Calculate deal amount
      let dealAmount = 0;

      // Filter and return quotes that has the kystgjerdet_selected_offer_status = true;
      const acceptedQuotes = filterQuotes(quotes);

      // Check if there are accepted quotes
      if (acceptedQuotes.length) {
        quotes = acceptedQuotes;
        dealAmount = calculateDealAmount(quotes);
      } else {
        dealAmount = calculateAverageDealAmount(quotes);
      }

      // Update deal amount
      await updateDealAmount(dealId, dealAmount);

      if (lineItemsUpdate) {
        // Get accepted quotes IDs
        const quotesId = getAcceptedQuotesIds(quotes);

        // Get all line items from accepted quotes
        const lineItems = await getAllLineItems(quotesId);

        // Remove all line items from deal
        await removeAllLineItemsFromDeal(dealId);

        // Add new line items to deal to auto calculate price;
        await createDealLineItemsFromQuote(lineItems, dealId);
      }
    } catch (error) {
      if (APP_MODE === "DEVELOPMENT")
        console.error("Error syncing quotes amount to deal:", error.message);
    }
  }

  // Sending response to webhook
  sendResponse(res, resData, "Deal amount synced successfully!");
};
