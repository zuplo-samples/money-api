import { ZuploContext } from "@zuplo/runtime";
import { getAllStripeProducts } from "../../services/stripe";

export async function getSubscriptionProducts(
  context: ZuploContext
) {
  return await getAllStripeProducts(context.log);
}