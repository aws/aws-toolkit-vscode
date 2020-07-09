// To determine capacity limits per table and account, in the current AWS region
// The following example returns the maximum read and write capacity units per table, and for the AWS account, in the current AWS region.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb.describeLimits(/*$0*/ {}).promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
