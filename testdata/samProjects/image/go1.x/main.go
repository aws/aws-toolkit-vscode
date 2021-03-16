// NOTE this is flat because of VGO mapping
package main

import (
    "github.com/aws/aws-lambda-go/lambda"
    "strings"
)

func handler(request string) (string, error) {
    return strings.ToUpper(request), nil
}

func main() {
    lambda.Start(handler)
}
