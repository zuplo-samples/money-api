import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { getUserInfo } from "../../services/auth0";
import { ErrorResponse } from "../../types";
import { MemoryZoneReadThroughCache } from "@zuplo/runtime";
import {
  ActiveStripeSubscriptions,
  getActiveStripeSubscription,
  getStripeCustomer,
} from "modules/services/stripe";

export async function stripeActiveSubscription(
  request: ZuploRequest,
  context: ZuploContext
) {
  const userInfo = await getUserInfo(request, context);

  if (userInfo instanceof ErrorResponse) {
    return userInfo;
  }

  return await getStripeSubscriptionByEmail({
    request,
    context,
  });
}

export const getStripeSubscriptionByEmail = async ({
  request,
  context,
}: {
  request: ZuploRequest;
  context: ZuploContext;
}): Promise<ActiveStripeSubscriptions | ErrorResponse> => {
  const userInfo = await getUserInfo(request, context);

  if (userInfo instanceof ErrorResponse) {
    return userInfo;
  }

  const cache = new MemoryZoneReadThroughCache<ActiveStripeSubscriptions>(
    "active-stripe-subscription",
    context
  );

  const cachedData = await cache.get(userInfo.email);

  if (cachedData) {
    return cachedData;
  }

  const stripeCustomer = await getStripeCustomer(userInfo.email, context.log);

  if (stripeCustomer instanceof ErrorResponse) {
    context.log.warn("customer not found in stripe", {
      email: userInfo.email,
    });
    return stripeCustomer;
  }

  const activeSubscription = await getActiveStripeSubscription({
    stripeCustomerId: stripeCustomer.id,
    logger: context.log,
  });

  if (activeSubscription instanceof ErrorResponse) {
    return activeSubscription;
  }

  cache.put(userInfo.email, activeSubscription, 3600);

  return activeSubscription;
};
