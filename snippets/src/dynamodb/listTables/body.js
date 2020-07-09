// To list tables
// This example lists all of the tables associated with the current AWS account and endpoint.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb.listTables(/*$0*/ {}).promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
}
