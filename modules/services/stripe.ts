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
    const customer = await stripe.customers.list({
      limit: 1,
      email,
    });

    if (customer.data.length === 0) {
      return new ErrorResponse(GetStripeDetailsErrorResponse.NotPayingCustomer);
    }

    return customer.data[0];
  } catch (err) {
    logger.error(err);
    return new ErrorResponse(
      "An error happened while looking for your subscription",
      500
    );
  }
};

export const getActiveStripeSubscription = async ({
  stripeCustomerId,
  logger,
}: {
  stripeCustomerId: string;
  logger: Logger;
}): Promise<Stripe.Subscription | ErrorResponse> => {
  try {
    const customerSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "active",
      limit: 1,
    });

    if (customerSubscriptions.data.length === 0) {
      logger.info("customer has no subscription", {
        stripeCustomerId,
      });
      return new ErrorResponse(GetStripeDetailsErrorResponse.NoSubscription);
    }

    return customerSubscriptions.data[0];
  } catch (err) {
    logger.error("Failed to get active stripe subscription: ", err);
    return new ErrorResponse("Failed to get active subscription.", 500);
  }
};

type SubscriptionItemUsage = {
  total_usage: number;
};

export async function getSubscriptionItemUsage(
  subscriptionItemId: string,
  logger: Logger
): Promise<SubscriptionItemUsage | ErrorResponse> {

  try {
    const subscriptionItemUsage = await stripe.subscriptionItems.listUsageRecordSummaries(
      subscriptionItemId,
      {
        limit: 1,
      }
    )

    if (subscriptionItemUsage.data.length === 0) {
      return new ErrorResponse(GetStripeDetailsErrorResponse.NoUsage);
    }

    return {
      total_usage: subscriptionItemUsage.data[0].total_usage,
    };
  } catch (err) {
    logger.error("Failed to get subscription item usage: ", err);
    return new ErrorResponse("Failed to get subscription usage.", 500);
  }
}

export const getStripeProduct = async (productId: string, logger: Logger): Promise<Stripe.Product | ErrorResponse> => {
  try {
    const product = await stripe.products.retrieve(productId);
    return product;
  } catch (err) {
    logger.error("Failed to get stripe product: ", err);
    return new ErrorResponse("Failed to find subscribed product.", 500);
  }
};

export const triggerMeteredSubscriptionItemUsage = async (
  subscriptionItemId: string,
  quantity: number,
  logger: Logger
) => {
  try {
    return stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
    });
  } catch (err) {
    logger.error("Failed to trigger metered subscription item usage: ", err);
    return new ErrorResponse("Could not process request.", 500);
  }
};
