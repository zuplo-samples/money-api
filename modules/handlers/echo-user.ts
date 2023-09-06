import { ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest) {
  return request.user;
}
