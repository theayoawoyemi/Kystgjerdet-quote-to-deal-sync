const hubspot = require("@hubspot/api-client");
const EventEmitter = require("events");

const eventEmitter = new EventEmitter();

// App Mode
const APP_MODE = process.env.APP_MODE || "DEVELOPMENT";

// HubSpot Private App Token
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

// HubSpot Initialization
const hubspotClient = new hubspot.Client({ accessToken: token });

// getAssociatedDealFromQuote
async function getAssociatedDealFromQuote(quoteId) {
  try {
    if (!quoteId) {
      throw new Error("quoteId is required");
    }

    // Get associated deals
    const associationResponse =
      await hubspotClient.crm.associations.v4.basicApi.getPage(
        "quotes",
        quoteId,
        "deals",
      );

    const deals = associationResponse?.results || [];

    if (!deals.length) {
      throw new Error(`No deals associated with quote ${quoteId}`);
    }

    const primaryDeal = deals.find((deal) =>
      deal.associationTypes?.some(
        (type) => type.label?.toLowerCase() === "primary",
      ),
    );

    const dealId = primaryDeal?.toObjectId || deals[0].toObjectId;

    // Fetch deal details
    const dealResponse = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      [
        "dealname",
        "dealstage",
        "pipeline",
        "hubspot_owner_id",
        "amount",
        "closedate",
      ],
    );

    return {
      success: true,
      quoteId,
      deal: {
        id: dealResponse.id,
        name: dealResponse.properties.dealname,
        pipeline: dealResponse.properties.pipeline,
        stage: dealResponse.properties.dealstage,
        ownerId: dealResponse.properties.hubspot_owner_id,
        amount: dealResponse.properties.amount,
        closeDate: dealResponse.properties.closedate,
      },
    };
  } catch (error) {
    const errorMessage =
      error?.response?.body?.message ||
      error?.body?.message ||
      error?.message ||
      "Unknown HubSpot error";

    console.error("Failed to retrieve associated deal", {
      quoteId,
      error: errorMessage,
    });

    throw new Error(
      `Failed to retrieve deal associated with quote ${quoteId}: ${errorMessage}`,
    );
  }
}

// Register listener
eventEmitter.on("Action", async function processAction(data) {
  const { quote_id, quote_action, message, decline_reason } = data;
  if (!quote_id || !quote_action || quote_action !== "Decline") return;

  try {
    const { deal } = await getAssociatedDealFromQuote(quote_id);
    const PIPELINE_ENUMS = ["708666642"];

    if (!deal?.id || PIPELINE_ENUMS.includes(deal.pipeline)) return;

    let properties = {};
    if (message) properties.tapkommentar = message;
    if (decline_reason) properties.taparsak = decline_reason;

    await hubspotClient.crm.deals.basicApi.update(deal.id, {
      properties,
    });
  } catch (error) {
    console.error(error);
  }
});

// Send response
const sendResponse = (res, payload, message = "Success") => {
  res.status(200).json({
    status: "success",
    message,
    payload: payload || undefined,
  });
};

const updateQuoteResponse = async (
  quoteId,
  response,
  comment,
  decline_reason,
) => {
  try {
    const properties = {
      client_quote_response: response,
      client_quote_comment: comment || "",
      arsak_til_avslag: decline_reason || "",
      klienhandlingtimestamp: Date.now().toString(),
    };

    const result = await hubspotClient.crm.quotes.basicApi.update(quoteId, {
      properties,
    });

    return result;
  } catch (error) {
    throw error;
  }
};

// Update Client Action on Quote
exports.updateAction = async (req, res, next) => {
  let { quote_id, quote_action, message, decline_reason } = req.body;

  try {
    if (!quote_id || !quote_action)
      throw new Error("Error updating client response");

    if (message === "Beskjed (Valgfri)") message = "";

    await updateQuoteResponse(quote_id, quote_action, message, decline_reason);

    eventEmitter.emit("Action", req.body);

    // Sending response
    sendResponse(res, [], "Client action updated successfully!");
  } catch (error) {
    return sendResponse(res, [], error.message);
  }
};

// Get Quote Deal Pipeline & Workflow
exports.getQuoteDealPipeline = async (req, res, next) => {
  let { quote_id } = req.query;

  try {
    if (!quote_id) throw new Error("Error getting quote id");

    const { deal } = await getAssociatedDealFromQuote(quote_id);

    // console.log(deal);

    // Sending response
    sendResponse(res, deal, "success");
  } catch (error) {
    return sendResponse(res, [], error.message);
  }
};
