import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { getUserInfo } from "../../services/auth0";
import { ErrorResponse } from "../../types";
import { getStripeSubscriptionByEmail } from "../subscription/get-subscription";

export default async function checkSubscriptionAndAddEmail(
  request: ZuploRequest,
  context: ZuploContext
) {
  const userInfo = await getUserInfo(request, context);

  if (userInfo instanceof ErrorResponse) {
    return userInfo;
  }

  const stripeSubscription = await getStripeSubscriptionByEmail({
    request,
    context,
  });

  if (stripeSubscription instanceof ErrorResponse) {
    return stripeSubscription;
  }

  context.custom.email = userInfo.email;

  return request;
}
