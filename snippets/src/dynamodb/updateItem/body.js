// To update an item in a table
// This example updates an item in the Music table. It adds a new attribute (Year) and modifies the AlbumTitle attribute.  All of the attributes in the item, as they appear after the update, are returned in the response.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .updateItem(
      /*$0*/ {
        ExpressionAttributeNames: {
          "#AT": "AlbumTitle",
          "#Y": "Year"
        },
        ExpressionAttributeValues: {
          ":t": {
            S: "Louder Than Ever"
          },
          ":y": {
            N: "2015"
          }
        },
        Key: {
          Artist: {
            S: "Acme Band"
          },
          SongTitle: {
            S: "Happy Day"
          }
        },
        ReturnValues: "ALL_NEW",
        TableName: "Music",
        UpdateExpression: "SET #Y = :y, #AT = :t"
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
