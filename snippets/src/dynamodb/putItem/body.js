// To add an item to a table
// This example adds a new item to the Music table.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .putItem(
      /*$0*/ {
        Item: {
          AlbumTitle: {
            S: "Somewhat Famous"
          },
          Artist: {
            S: "No One You Know"
          },
          SongTitle: {
            S: "Call Me Today"
          }
        },
        ReturnConsumedCapacity: "TOTAL",
        TableName: "Music"
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
