import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { getUserInfo } from "../../services/auth0";
import { ErrorResponse, JsonResponse } from "../../types";
import {
  createOrGetCustomer, stripeRequest
} from "../../services/stripe";

export async function createCheckoutSession(
  request: ZuploRequest,
  context: ZuploContext
) {
  // 1. Get the user info from Auth0
  const userInfo = await getUserInfo(request, context);

  if (userInfo instanceof ErrorResponse) {
    return userInfo;
  }

  // 2. Get the Stripe Price object
  const requestUrl = new URL(request.url);
  const searchParams = new URLSearchParams(requestUrl.search);
  const priceId = searchParams.get("priceId");
  const redirectUrl = searchParams.get("redirectUrl");

  if (!priceId) {
    return new ErrorResponse("No priceId provided.", 400);
  }

  let price;
  try {
    price = await stripeRequest(`/v1/prices/${priceId}`);

    if (price.type !== "recurring") {
      return new ErrorResponse("Pricing model not supported.", 400);
    }
  } catch (e) {
    return new ErrorResponse("Failed to get price.", 500);
  }

  // 3. Get the Stripe Customer object
  const stripeCustomer = await createOrGetCustomer({
    email: userInfo.email,
    logger: context.log,
  });

  if (stripeCustomer instanceof ErrorResponse) {
    return stripeCustomer;
  }

  // 4. Create the Stripe Checkout Session
  let stripeSession;
  try {

    stripeSession = await stripeRequest(
      "/v1/checkout/sessions",
      {
        method: "POST",
        body: new URLSearchParams({
          'payment_method_types[]': 'card',
          'billing_address_collection': 'auto',
          'customer': stripeCustomer.id,
          'customer_update[address]': 'auto',
          'customer_update[name]': 'auto',
          'customer_update[shipping]': 'never',
          'line_items[0][price]': priceId,
          'mode': 'subscription',
          'allow_promotion_codes': 'true',
          'success_url': `${redirectUrl}/dashboard`,
          'cancel_url': `${redirectUrl}/`,
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
  } catch (err) {
    context.log.error("Failed to create checkout session: ", err);
    return new ErrorResponse("Failed to create checkout session.", 500);
  }

  if (!stripeSession?.url) {
    context.log.error("Failed to create checkout session: ", stripeSession);
    return new ErrorResponse("Failed to create checkout session.", 500);
  }

  return new JsonResponse(stripeSession);
}
