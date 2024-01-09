import { Logger } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { ErrorResponse } from "../types";

const STRIPE_API_KEY = environment.STRIPE_API_KEY;

export const stripeRequest = async (path: string, options?: RequestInit) => {
  return fetch("https://api.stripe.com" + path, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${STRIPE_API_KEY}`,
    },
  }).then((res) => res.json());
};


export const createOrGetCustomer = async ({
  email,
  logger
}: {
  email: string;
  logger: Logger;
}): Promise<StripeCustomer | ErrorResponse> => {
  try {
    const customerSearchResult = await stripeRequest(
      `/v1/customers?email=${email}`
    );

    if (customerSearchResult.data.length > 0) {
      return customerSearchResult.data[0] as StripeCustomer;
    }

    const newCustomer = await stripeRequest(
      `/v1/customers`,
      {
        method: "POST",
        body: new URLSearchParams({
          email,
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    logger.info("Created new customer: ", newCustomer);

    return newCustomer;
  } catch (err) {
    logger.error("Failed to create customer: ", err);
    return new ErrorResponse("Failed to create customer", 500);
  }
};

type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  priceId: string;
  currency: string;
};

export const getAllStripeProducts = async (logger: Logger): Promise<StripeProduct[] | ErrorResponse> => {
  try {
    const products = await stripeRequest("/v1/products");

    const prices = await stripeRequest("/v1/prices");

    const data = products.data
      .map((product) => {
        const price = prices.data.find(
          (price) => price.product === product.id,
        );

        if (!price) {
          return null;
        }

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: price.unit_amount ? price.unit_amount / 100 : 0,
          priceId: price.id,
          currency: price.currency,
        };
      })
      .filter(
        (product): product is NonNullable<typeof product> =>
          product !== null,
      );

    return data;
  } catch (err) {
    logger.error("Failed to get stripe products", err);
    return new ErrorResponse("Failed to get products", 500);
  }
};

type StripeCustomer = {
  id: string;
};

enum GetStripeDetailsErrorResponse {
  NotPayingCustomer = "You are not a paying customer... yet?",
  NoSubscription = "You don't have an active subscription.",
  NoUsage = "You don't have any usage for your subscription in Stripe",
}

export const getStripeCustomer = async (
  email: string,
  logger: Logger
): Promise<StripeCustomer | ErrorResponse> => {
  try {
    const customerSearchResult = await stripeRequest(
      `/v1/customers?email=${email}`
    );

    logger.info("customerSearchResult", customerSearchResult)

    if (customerSearchResult.data.length === 0) {
      logger.warn("User not found in Stripe", email);
      return new ErrorResponse(GetStripeDetailsErrorResponse.NotPayingCustomer);
    }

    return customerSearchResult.data[0] as StripeCustomer;
  } catch (err) {
    logger.error(err);
    return new ErrorResponse(
      "An error happened while looking for your subscription",
      500
    );
  }
};

export type ActiveStripeSubscriptions = {
  id: string;
  customer: string;
  plan: {
    usage_type: "metered" | "licensed";
    product: string;
  };
  items: {
    data: {
      id: string;
    }[];
  };
};

export const getActiveStripeSubscription = async ({
  stripeCustomerId,
  logger,
}: {
  stripeCustomerId: string;
  logger: Logger;
}): Promise<ActiveStripeSubscriptions | ErrorResponse> => {
  const customerSubscription = await stripeRequest(
    "/v1/subscriptions?customer=" + stripeCustomerId + "&status=active&limit=1"
  );

  if (customerSubscription.data.length === 0) {
    logger.warn("customer has no subscription", {
      stripeCustomerId,
    });
    return new ErrorResponse(GetStripeDetailsErrorResponse.NoSubscription);
  }

  if (
    !customerSubscription.data[0].plan ||
    customerSubscription.data[0].status !== "active"
  ) {
    logger.warn("customer has no active subscription plan", {
      stripeCustomerId,
    });
    return new ErrorResponse(GetStripeDetailsErrorResponse.NoSubscription);
  }

  return customerSubscription.data[0];
};

type SubscriptionItemUsage = {
  total_usage: number;
};

export async function getSubscriptionItemUsage(
  subscriptionItemId: string
): Promise<SubscriptionItemUsage | ErrorResponse> {
  const subscriptionItemUsageRecords = await stripeRequest(
    "/v1/subscription_items/" + subscriptionItemId + "/usage_record_summaries"
  );

  if (subscriptionItemUsageRecords.data.length === 0) {
    return new ErrorResponse(GetStripeDetailsErrorResponse.NoUsage);
  }

  return subscriptionItemUsageRecords.data[0];
}

export const getStripeProductById = async (productId: string): Promise<StripeProduct> => {
  return await stripeRequest("/v1/products/" + productId);
};

export const getCustomerPortalSession = async (
  customerId: string,
  returnUrl: string
) => {
  return await stripeRequest("/v1/billing_portal/sessions", {
    method: "POST",
    body: new URLSearchParams({
      customer: customerId,
      return_url: returnUrl,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

export const triggerMeteredSubscriptionItemUsage = async (
  subscriptionItemId: string,
  quantity: number,
) => {
  const params = new URLSearchParams();
  params.append("quantity", quantity.toString());

  return stripeRequest(
    `/v1/subscription_items/${subscriptionItemId}/usage_records`,
    {
      body: params,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
};