import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { getUserInfo } from "../../services/auth0";
import { ErrorResponse } from "../../types";
import { environment } from "@zuplo/runtime";
import { getStripeSubscriptionByEmail } from "../subscription/get-subscription";

interface CreateConsumerRequestBody {
  description: string;
}

export async function createConsumer(
  request: ZuploRequest,
  context: ZuploContext
) {
  const data: CreateConsumerRequestBody = await request.json();
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

  return await createAPIKeyConsumer({
    email: userInfo.email,
    description: data.description,
    stripeCustomerId: stripeSubscription.customer,
  });
}

export const createAPIKeyConsumer = async ({
  email,
  description,
  stripeCustomerId,
}) => {
  const keyPrefix = email.replace(/[@.]/g, "-");
  const keyName = `${keyPrefix}-${crypto.randomUUID()}`;

  const body = {
    name: keyName,
    description: description,
    managers: [email],
    metadata: {
      stripeCustomerId,
    },
    tags: {
      email,
    },
  };

  const response = await fetch(
    `${environment.BUCKET_URL}/consumers/?with-api-key=true`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.ZAPI_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  return response;
};
