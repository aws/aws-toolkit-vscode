// To query an item
// This example queries items in the Music table. The table has a partition key and sort key (Artist and SongTitle), but this query only specifies the partition key value. It returns song titles by the artist named "No One You Know".
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .query(
      /*$0*/ {
        ExpressionAttributeValues: {
          ":v1": {
            S: "No One You Know"
          }
        },
        KeyConditionExpression: "Artist = :v1",
        ProjectionExpression: "SongTitle",
        TableName: "Music"
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
