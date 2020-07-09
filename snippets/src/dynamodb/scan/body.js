// To scan a table
// This example scans the entire Music table, and then narrows the results to songs by the artist "No One You Know". For each item, only the album title and song title are returned.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .scan(
      /*$0*/ {
        ExpressionAttributeNames: {
          "#AT": "AlbumTitle",
          "#ST": "SongTitle"
        },
        ExpressionAttributeValues: {
          ":a": {
            S: "No One You Know"
          }
        },
        FilterExpression: "Artist = :a",
        ProjectionExpression: "#ST, #AT",
        TableName: "Music"
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
