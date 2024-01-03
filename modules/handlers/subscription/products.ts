import { ZuploContext } from "@zuplo/runtime";
import { getStripeProducts } from "../../services/stripe";

export async function getSubscriptionProducts(
  context: ZuploContext
) {
  return await getStripeProducts(context.log);
}