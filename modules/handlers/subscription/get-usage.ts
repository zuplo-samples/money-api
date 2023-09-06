import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { getUserInfo } from "../../services/auth0";
import { getSubscriptionItemUsage } from "../../services/stripe";
import { ErrorResponse } from "../../types";
import { getStripeSubscriptionByEmail } from "./get-subscription";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const userInfo = await getUserInfo(request, context);

  if (userInfo instanceof ErrorResponse) {
    return userInfo;
  }

  const subscription = await getStripeSubscriptionByEmail({
    request,
    context,
  });

  if (subscription instanceof ErrorResponse) {
    return subscription;
  }

  return await getSubscriptionItemUsage(subscription.items.data[0].id);
}
