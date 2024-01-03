import { Logger } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { ErrorResponse } from "../types";
import { Stripe } from "stripe";



const STRIPE_API_KEY = environment.STRIPE_API_KEY || "";

export const stripe = new Stripe(STRIPE_API_KEY, {
  apiVersion: "2023-10-16",
});

export const createOrGetCustomer = async ({
  email,
  logger
}: {
  email: string;
  logger: Logger;
}): Promise<Stripe.Customer | ErrorResponse> => {
  try {
    const existingCustomer = await stripe.customers.list({
      limit: 1,
      email,
    });

    if (existingCustomer.data.length > 0) {
      return existingCustomer.data[0];
    }

    const newCustomer = await stripe.customers.create({
      email,
    });

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


export const getStripeProducts = async (logger: Logger): Promise<StripeProduct[] | ErrorResponse> => {
  try {
    const subscriptions = await stripe.products.list({
      limit: 100,
    });

    const prices = await stripe.prices.list({
      limit: 100,
    });

    const data = subscriptions.data
      .map((subscription) => {
        const price = prices.data.find(
          (price) => price.product === subscription.id,
        );

        if (!price) {
          return null;
        }

        return {
          id: subscription.id,
          name: subscription.name,
          description: subscription.description,
          price: price.unit_amount ? price.unit_amount / 100 : 0,
          priceId: price.id,
          currency: price.currency,
        };
      })
      .filter(
        (subscription): subscription is NonNullable<typeof subscription> =>
          subscription !== null,
      );

    return data;
  } catch (err) {
    logger.error("Failed to get stripe products", err);
    return new ErrorResponse("Failed to get products", 500);
  }
};

export const stripeRequest = async (path: string, options?: RequestInit) => {
  return fetch("https://api.stripe.com" + path, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${STRIPE_API_KEY}`,
    },
  }).then((res) => res.json());
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

export const getStripeProduct = async (productId: string) => {
  return stripeRequest("/v1/products/" + productId);
};

export const triggerMeteredSubscriptionItemUsage = async (
  subscriptionItemId: string,
  quantity: number
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
