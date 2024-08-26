import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { getUserInfo } from "../../services/auth0";
import { getCustomerPortalSession } from "../../services/stripe";
import { ErrorResponse, JsonResponse } from "../../types";
import { getStripeSubscriptionByEmail } from "./get-subscription";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const url = new URL(request.url);
  const returnUrl = url.searchParams.get("returnUrl");

  if (!returnUrl) {
    return new ErrorResponse("Missing return_url");
  }

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

  const customerPortalSession = await getCustomerPortalSession(
    subscription.customer,
    returnUrl
  );

  return new JsonResponse({
    redirect_url: customerPortalSession.url,
  });
}
