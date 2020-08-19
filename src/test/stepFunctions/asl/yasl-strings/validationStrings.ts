/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const documentStartAtInvalid = `
  StartAt: First
  States: 
    FirstState: 
      Type: Pass
      End: true
`

export const documentStartAtValid = `
  StartAt: FirstState
  States: 
    FirstState: 
      Type: Pass
      End: true
`

export const documentStartAtNestedInvalid = `
  StartAt: LookupCustomerInfo
  States: 
    LookupCustomerInfo: 
      Type: Parallel
      End: true
      Branches: 
        - StartAt: Loo
          States: 
            LookupAddress: 
              Type: Pass
              End: true
        - StartAt: LookupPhone
          States: 
            LookupPhone: 
              Type: Pass
              End: true
    Validate-All: 
      Type: Map
      ItemsPath: $.items
      Iterator: 
          StartAt: Vali
          States: 
              Validate: 
                  Type: Pass
                  End: true
      End: true
`

export const documentInvalidNext = `
  StartAt: FirstState
  States: 
    FirstState: 
      Type: Pass
      Next: Next
    NextState: 
      Type: Pass
      End: true
`

export const documentValidNext = `
  StartAt: FirstState
  States: 
    FirstState: 
      Type: Pass
      Next: NextState
    NextState: 
      Type: Pass
      End: true
`

export const documentInvalidNextNested = `
  StartAt: LookupCustomerInfo
  States: 
    LookupCustomerInfo: 
      Type: Parallel
      End: true
      Branches: 
        - StartAt: LookupAddress
          States: 
            LookupAddress: 
              Type: Pass
              Next: InvalidName
            Second: 
              Type: Pass
              End: true
        - StartAt: LookupPhone
          States: 
            LookupPhone: 
              Type: Pass
              Next: Second
            Second: 
              Type: Pass
              End: true
    Validate-All: 
      Type: Map
      ItemsPath: $.items
      Iterator: 
        StartAt: Validate
        States: 
          Validate: 
            Type: Pass
            Next: InvalidName
          Second: 
            Type: Pass
            End: true
      End: true
`

export const documentUnreachableState = `
  StartAt: FirstS
  States: 
    AndHere: 
      Type: Pass
      Next: FirstState
    FirstState: 
      Type: Pass
      Next: SecondState
    SecondState: 
      Type: Pass
      End: true
    ThirdState: 
      Type: Pass
      End: true
    FourthState: 
      Type: Pass
      End: true
`

export const documentNestedUnreachableState = `
  StartAt: LookupCustomerInfo
  States: 
    LookupCustomerInfo: 
      Type: Parallel
      Next: Validate-All
      Branches: 
        - StartAt: LookupAddress
          States: 
            LookupAddress: 
              Type: Pass
              End: true
            Second: 
              Type: Pass
              End: true
        - StartAt: LookupPhone
          States: 
            LookupPhone: 
              Type: Pass
              Next: Second
            Second: 
              Type: Pass
              End: true
    Validate-All: 
      Type: Map
      ItemsPath: $.items
      Iterator: 
        StartAt: Validate
        States: 
          Validate: 
            Type: Pass
            End: true
          Second: 
            Type: Pass
            End: true
      End: true
`

export const documentNoTerminalState = `
  StartAt: FirstState
  States: 
    AndHere: 
      Type: Pass
      Next: SecondState
    FirstState: 
      Type: Pass
      Next: SecondState
    SecondState: 
      Type: Pass
      Next: AndHere
  `

export const documentNestedNoTerminalState = `
  StartAt: LookupCustomerInfo
  States: 
    LookupCustomerInfo: 
      Type: Parallel
      Next: Validate-All
      Branches: 
        - StartAt: LookupAddress
          States: 
            LookupAddress: 
              Type: Pass
              Next: Second
            Second: 
              Type: Pass
              End: true
        - StartAt: LookupPhone
          States: 
            LookupPhone: 
              Type: Pass
              Next: Second
            Second: 
              Type: Pass
              Next: LookupPhone
    Validate-All: 
      Type: Map
      ItemsPath: $.items
      Iterator: 
        StartAt: Validate
        States: 
          Validate: 
            Type: Pass
            Next: Second
          Second: 
            Type: Pass
            Next: Third
          Third: 
            Type: Pass
            Next: Validate
      End: true
`

export const documentSucceedFailTerminalState = `
  StartAt: LookupCustomerInfo
  States: 
    LookupCustomerInfo: 
      Type: Parallel
      Next: Validate-All
      Branches: 
        - StartAt: LookupAddress
          States: 
            LookupAddress: 
              Type: Pass
              Next: Second
            Second: 
              Type: Succeed
        - StartAt: LookupPhone
          States: 
            LookupPhone: 
              Type: Pass
              Next: Second
            Second: 
              Type: Fail
    Validate-All: 
      Type: Map
      ItemsPath: $.items
      Iterator: 
        StartAt: Validate
        States: 
          Validate: 
            Type: Pass
            Next: Second
          Second: 
            Type: Pass
            Next: Third
          Third: 
            Type: Succeed
      End: true
`

export const documentTaskValidVariableSubstitution = `
  Comment: A Catch example of the Amazon States Language using an AWS Lambda Function
  StartAt: HelloWorld
  States: 
    HelloWorld: 
      Type: Task
      Resource: \$variableName
      End: true
`

export const documentTaskInvalidArn = `
  Comment: A Catch example of the Amazon States Language using an AWS Lambda Function
  StartAt: HelloWorld
  States: 
    HelloWorld: 
      Type: Task
      Resource: InvalidArn
      End: true
`

export const documentTaskCatchTemplate = `
  Comment: A Catch example of the Amazon States Language using an AWS Lambda Function
  StartAt: HelloWorld
  States: 
    HelloWorld: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:myFunction
      Catch: 
        - ErrorEquals: 
            - CustomError
          Next: CustomErrorFallback
        - ErrorEquals: 
            - States.TaskFailed
          Next: ReservedTypeFallback
        - ErrorEquals: 
            - States.ALL
          Next: CatchAllFallback
      End: true
    CustomErrorFallback: 
      Type: Pass
      Result: This is a fallback from a custom lambda function exception
      End: true
    ReservedTypeFallback: 
      Type: Pass
      Result: This is a fallback from a reserved error code
      End: true
    CatchAllFallback: 
      Type: Pass
      Result: This is a fallback from a reserved error code
      End: true
`

export const documentParallelCatchTemplate = `
  StartAt: Parallel
  States: 
    Parallel: 
      Type: Parallel
      Next: Final State
      Catch: 
        - ErrorEquals: 
            - States.ALL
          Next: CatchState
      Branches: 
        - StartAt: Wait 20s
          States: 
            Wait 20s: 
              Type: Wait
              Seconds: 20
              End: true
    Final State: 
      Type: Pass
      End: true
    CatchState: 
      Type: Pass
      End: true
`

export const documentMapCatchTemplate = `
  StartAt: Map
  States: 
    Map: 
      Type: Map
      ItemsPath: $.array
      ResultPath: $.array
      MaxConcurrency: 2
      Next: Final State
      Iterator: 
          StartAt: Pass
          States: 
              Pass: 
                  Type: Pass
                  Result: Done!
                  End: true
      Catch: 
        - ErrorEquals: 
            - CustomError
          Next: CustomErrorFallback
        - ErrorEquals: 
            - States.TaskFailed
          Next: ReservedTypeFallback
        - ErrorEquals: 
            - States.ALL
          Next: CatchAllFallback
    Final State: 
      Type: Pass
      End: true
    CustomErrorFallback: 
      Type: Pass
      Result: This is a fallback from a custom lambda function exception
      End: true
    ReservedTypeFallback: 
      Type: Pass
      Result: This is a fallback from a reserved error code
      End: true
    CatchAllFallback: 
      Type: Pass
      Result: This is a fallback from a reserved error code
      End: true
`

export const documentMapCatchTemplateInvalidNext = `
  StartAt: Map
  States: 
    Map: 
      Type: Map
      ItemsPath: $.array
      ResultPath: $.array
      MaxConcurrency: 2
      Next: Final State
      Iterator: 
        StartAt: Pass
        States: 
          Pass: 
              Type: Pass
              Result: Done!
              End: true
      Catch: 
        - ErrorEquals: 
            - CustomError
          Next: invalid
        - ErrorEquals: 
            - States.TaskFailed
          Next: ReservedTypeFallback
        - ErrorEquals: 
            - States.ALL
          Next: invalid2
    Final State: 
      Type: Pass
      End: true
    CustomErrorFallback: 
      Type: Pass
      Result: This is a fallback from a custom lambda function exception
      End: true
    ReservedTypeFallback: 
      Type: Pass
      Result: This is a fallback from a reserved error code
      End: true
    CatchAllFallback: 
      Type: Pass
      Result: This is a fallback from a reserved error code
      End: true
`

export const documentTaskCatchTemplateInvalidNext = `
  Comment: A Catch example of the Amazon States Language using an AWS Lambda Function
  StartAt: HelloWorld
  States: 
    HelloWorld: 
        Type: Task
        Resource: arn:aws:lambda:us-east-1:111111111111:function:myFunction
        Catch: 
          - ErrorEquals: 
            - CustomError
            Next: CustomErrorFallback
          - ErrorEquals: 
            - States.TaskFailed
            Next: ReservedType
          - ErrorEquals: 
              - States.ALL
            Next: CatchAllFallback
        End: true
    CustomErrorFallback: 
      Type: Pass
      Result: This is a fallback from a custom lambda function exception
      End: true
`

export const documentParallelCatchTemplateInvalidNext = `
  StartAt: Parallel
  States: 
    Parallel: 
      Type: Parallel
      Next: Final State
      Catch: 
        - ErrorEquals: 
          - States.ALL
          Next: Catchddd
      Branches: 
        - StartAt: Wait 20s
          States: 
            Wait 20s: 
              Type: Wait
              Seconds: 20
              End: true
    Final State: 
      Type: Pass
      End: true
    CatchState: 
      Type: Pass
      End: true
`
export const documentChoiceValidNext = `
  StartAt: Parallel
  States: 
    Parallel: 
      Type: Parallel
      Next: Final State
      Branches: 
        - StartAt: FirstState
          States: 
            FirstState: 
              Type: Pass
              Next: ChoiceState
            ChoiceState: 
              Type: Choice
              Choices: 
                - Variable: $.Comment
                  NumericEquals: 1
                  Next: Last
              Default: FirstState
            Last: 
              Type: Pass
              End: true
    Final State: 
      Type: Pass
      End: true
  `

export const documentChoiceInvalidNext = `
  StartAt: Parallel
  States: 
    Parallel: 
      Type: Parallel
      Next: Final State
      Branches: 
        - StartAt: FirstState
          States: 
            FirstState: 
              Type: Pass
              Next: ChoiceState
            ChoiceState: 
              Type: Choice
              Choices: 
                - Variable: $.Comment
                  NumericEquals: 1
                  Next: La
              Default: FirstState
    Final State: 
      Type: Pass
      End: true
`

export const documentChoiceValidDefault = `
  StartAt: FirstState
  States: 
    FirstState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:FUNCTION_NAME
      Next: ChoiceState
    ChoiceState: 
      Type: Choice
      Choices: 
        - Variable: $.foo
          NumericEquals: 1
          Next: FirstMatchState
      Default: DefaultState
    FirstMatchState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:OnFirstMatch
      Next: NextState
    DefaultState: 
      Type: Fail
      Error: DefaultStateError
      Cause: No Matches!
    NextState: 
      Type: Pass
      End: true
`

export const documentChoiceInvalidDefault = `
  StartAt: FirstState
  States: 
    FirstState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:FUNCTION_NAME
      Next: ChoiceState
    ChoiceState: 
      Type: Choice
      Choices: 
        - Variable: $.foo
          NumericEquals: 1
          Next: FirstMatchState
      Default: DefaultStatexxxxxx
    FirstMatchState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:OnFirstMatch
      Next: NextState
    DefaultState: 
      Type: Fail
      Error: DefaultStateError
      Cause: No Matches!
    NextState: 
      Type: Pass
      End: true
`

export const documentChoiceNoDefault = `
  StartAt: ChoiceState
  States: 
    ChoiceState: 
      Type: Choice
      Choices: 
        - Variable: $.foo
          NumericEquals: 1
          Next: FirstMatchState
    FirstMatchState: 
      Type: Pass
      End: true
`

export const documentChoiceDefaultBeforeChoice = `
  StartAt: ChoiceState
  States: 
    DefaultState: 
      Type: Fail
      Error: DefaultStateError
      Cause: No Matches!
    ChoiceState: 
      Type: Choice
      Choices: 
        - Variable: $.foo
          NumericEquals: 1
          Next: FirstMatchState
      Default: DefaultState
    FirstMatchState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:OnFirstMatch
      End: true
`

export const documentInvalidPropertiesState = `
  StartAt: FirstState
  States: 
    FirstState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:FUNCTION_NAME
      Next: ChoiceState
      SomethingInvalid1: dddd
      SomethingInvalid2: eeee
    ChoiceState: 
      Type: Choice
      Choices: 
        - Variable: $.foo
          NumericEquals: 1
          Next: FirstMatchState
      Default: DefaultState
    FirstMatchState: 
      Type: Task
      Resource: arn:aws:lambda:us-east-1:111111111111:function:OnFirstMatch
      Next: NextState
    DefaultState: 
      Type: Fail
      Error: DefaultStateError
      Cause: No Matches!
    NextState: 
      Type: Pass
      End: true
`

export const documentInvalidPropertiesCatch = `
StartAt: HelloWorld
States: 
  HelloWorld: 
    Type: Task
    Resource: arn:aws:lambda:us-east-1:111111111111:function:FUNCTION_NAME
    Catch: 
      - ErrorEquals: 
          - CustomError
        Next: CustomErrorFallback
        OneInvalid: something
      - ErrorEquals: 
          - States.TaskFailed
        Next: ReservedTypeFallback
        TwoInvalid: something
        ThreeInvalid: something
      - ErrorEquals: 
          - States.ALL
        Next: CatchAllFallback
    End: true
  
  CustomErrorFallback: 
    Type: Pass
    Result: This is a fallback from a custom lambda function exception
    End: true
  
  ReservedTypeFallback: 
    Type: Pass
    Result: This is a fallback from a reserved error code
    End: true
  
  CatchAllFallback: 
    Type: Pass
    Result: This is a fallback from a reserved error code
    End: true
`

export const documentInvalidPropertiesChoices = `
Comment: An example of the Amazon States Language using a choice state.
StartAt: FirstState
States:
  FirstState:
    Type: Task
    Resource: arn:aws:lambda:us-east-1:111111111111:function:FUNCTION_NAME
    Next: ChoiceState
  ChoiceState:
    Type: Choice
    Choices:
    - Not:
        Variable: "$.foo"
        StringEquals: blabla
        NumericGreaterThanEquals: 20
        FirstInvalidProp: 
      Next: FirstMatchState
    - And:
      - Not:
          Variable: "$.foo"
          StringEquals: blabla
          SecondInvalidProp: 
          Next: FirstMatchState
      - Or:
        - Variable: "$.value"
          NumericGreaterThanEquals: 20
          ThirdInvalidProp: 
          Next: FirstMatchState
        - Variable: "$.value"
          NumericLessThan: 30
      - Variable: "$.foo"
        NumericGreaterThanEquals: 20
        Next: SecondMatchState
      Next: SecondMatchState
    Default: DefaultState
  FirstMatchState:
    Type: Task
    Resource: arn:aws:lambda:us-east-1:111111111111:function:OnFirstMatch
    Next: NextState
  SecondMatchState:
    Type: Task
    Resource: arn:aws:lambda:us-east-1:111111111111:function:OnSecondMatch
    Next: NextState
  DefaultState:
    Type: Fail
    Error: DefaultStateError
    Cause: No Matches!
  NextState:
    Type: Task
    Resource: arn:aws:lambda:us-east-1:111111111111:function:FUNCTION_NAME
    End: true
`
export const documentInvalidPropertiesRoot = `
  StartAt: Succeed
  TimeoutSeconds: 3
  Version: "1.0"
  Comment: It's a test
  NewTopLevelField: This field is not supported
  States: 
    Succeed: 
      Type: Succeed
`
export const documentInvalidPropertiesRootNested = `
  StartAt: Map
  States: 
    Map: 
      Type: Map
      ItemsPath: $.array
      Next: Final State
      Iterator: 
        StartAt: Pass
        Comment: Nested comment
        InvalidProp: This is invalid
        States: 
          Pass: 
            Type: Pass
            Result: Done!
            End: true
    Final State: 
      Type: Pass
      End: true
`

export const documentValidParametersJsonPath = `
  StartAt: GetManualReview
  States: 
    GetManualReview: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke.waitForTaskToken
      Parameters: 
        FunctionName: get-model-review-decision
        Payload: 
          model.$: $.new_model
          token.$: $$.Task.Token
          someProp: 
            nested_model.$: $.new_model
            nested_token.$: $$.Task.Token
        Qualifier: prod-v1
      End: true
`

export const documentInvalidParametersJsonPath = `
  StartAt: GetManualReview
  States: 
    GetManualReview: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke.waitForTaskToken
      Parameters: 
        FunctionName: get-model-review-decision
        Payload: 
          model.$: 
          token.$: $$.Task.Token
          someProp: 
            nested_model.$: 22
            nested_token.$: true
        Qualifier.$: prod-v1
      End: true
`
export const documentValidParametersIntrinsicFunction = `
  StartAt: Invoke Lambda function
  States: 
    Invoke Lambda function: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke
      Parameters: 
        FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
        Payload: 
          Input1.$: States.Format($.template $.firstName $.lastName)
          Input2.$: States.JsonToString($)
          Input3.$: States.StringToJson($.escaped)
          Input4.$: States.Format($.template $.firstName $.lastName)    
          Input5.$: States.JsonToString($)    
          Input6.$: States.StringToJson($.escaped)
      Next: Succeed state
    Succeed state: 
      Type: Succeed
`

export const documentInvalidParametersIntrinsicFunction = `
  StartAt: Invoke Lambda function
  States: 
    Invoke Lambda function: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke
      Parameters: 
        FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
        Payload: 
          Input1.$: "  States.Format($.template $.firstName $.lastName)"
          Input2.$: "States.JsonToString($"
          Input3.$: "States.StringToJson $.escaped)"
          Input4.$: "States. "
          Input5.$: "JsonToString($)"
          Input6.$: "something else  "  
      Next: Succeed state
    Succeed state: 
      Type: Succeed
`

export const documentValidAslImprovements = `
  StartAt: Invoke Lambda function
  States: 
    Invoke Lambda function: 
        Type: Task
        TimeoutSecondsPath: $.path
        HeartbeatSecondsPath: $.path
        InputPath: $$.Execution.Id
        OutputPath: $$.Execution.Id
        Resource: arn:aws:states:::lambda:invoke
        Parameters: 
            FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
            Payload: 
              Input.$: $
        ResultSelector: 
            example.$: $
            example2: 
              nested.$: $.path
        Next: MapState
    MapState: 
        Type: Map
        ItemsPath: '$.array'
        MaxConcurrency: 0
        Iterator: 
          StartAt: Pass
          States: 
            Pass: 
              Type: Pass
              Result: Done!
              End: true
        ResultSelector: 
            example.$: $
            example2: 
              nested.$: $.path
        ResultPath: $.output
        Next: ParallelState
    ParallelState: 
        Type: Parallel
        Branches: 
          - StartAt: State1
            States: 
                State1: 
                  Type: Pass
                  End: true
          - StartAt: State2
            States: 
                State2: 
                  Type: Pass
                  End: true
        ResultSelector: 
            example.$: $
            example2: 
              nested.$: $.path
        Next: Compare 2 variables
    
    Compare 2 variables: 
        Type: Choice
        Choices: 
          - Variable: $.var1
            Next: "Succeed state"
            IsNull: true
          - Variable: $.var1
            Next: "Succeed state"
            IsPresent: true
          - Variable: $.var1
            Next: "Succeed state"
            IsNumeric: true
          - Variable: $.var1
            Next: "Succeed state"
            IsString: true
          - Variable: $.var1
            Next: "Succeed state"
            IsBoolean: true
          - Variable: $.var1
            Next: "Succeed state"
            IsTimestamp: true
          - Variable: $.var1
            Next: "Succeed state"
            StringMatches: uuu*
          - Variable: $.var1
            Next: "Succeed state"
            StringEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            StringLessThanPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            StringGreaterThanPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            StringLessThanEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            StringGreaterThanEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            NumericEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            NumericLessThanPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            NumericGreaterThanPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            NumericLessThanEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            NumericGreaterThanEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            BooleanEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            TimestampEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            TimestampLessThanPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            TimestampGreaterThanPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            TimestampLessThanEqualsPath: $.some.path
          - Variable: $.var1
            Next: "Succeed state"
            TimestampGreaterThanEqualsPath: $.some.path
          - And: 
            - Variable: $.var1
              IsNull: true
            - Variable: $.var1
              IsPresent: true
            - Variable: $.var1
              IsNumeric: true
            - Variable: $.var1
              IsString: true
            - Variable: $.var1
              IsBoolean: true
            - Variable: $.var1
              IsTimestamp: true
            - Variable: $.var1
              StringMatches: uuu*
            - Variable: $.var1
              StringEqualsPath: $.some.path
            - Variable: $.var1
              StringLessThanPath: $.some.path
            - Variable: $.var1
              StringGreaterThanPath: $.some.path
            - Variable: $.var1
              StringLessThanEqualsPath: $.some.path
            - Variable: $.var1
              StringGreaterThanEqualsPath: $.some.path
            - Variable: $.var1
              NumericEqualsPath: $.some.path
            - Variable: $.var1
              NumericLessThanPath: $.some.path
            - Variable: $.var1
              NumericGreaterThanPath: $.some.path
            - Variable: $.var1
              NumericLessThanEqualsPath: $.some.path
            - Variable: $.var1
              NumericGreaterThanEqualsPath: $.some.path
            - Variable: $.var1
              BooleanEqualsPath: $.some.path
            - Variable: $.var1
              TimestampEqualsPath: $.some.path
            - Variable: $.var1
              TimestampLessThanPath: $.some.path
            - Variable: $.var1
              TimestampGreaterThanPath: $.some.path
            - Variable: $.var1
              TimestampLessThanEqualsPath: $.some.path
            - Variable: $.var1
              TimestampGreaterThanEqualsPath: $.some.path
            Next: "Succeed state"
        Default: Fail state
    Fail state: 
        Type: Fail
    "Succeed state": 
        Type: Succeed
`

export const documentValidResultSelectorJsonPath = `
  StartAt: GetManualReview
  States: 
    GetManualReview: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke.waitForTaskToken
      ResultSelector: 
        prop1: get-model-review-decision
        prop2: 
          model.$: $.new_model
          token.$: $$.Task.Token
          someProp: 
            nested_model.$: $.new_model
            nested_token.$: $$.Task.Token
        Qualifier: prod-v1
      Parameters: 
        FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
      End: true
`

export const documentInvalidResultSelectorJsonPath = `
  StartAt: GetManualReview
  States: 
    GetManualReview: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke.waitForTaskToken
      ResultSelector: 
        prop1: get-model-review-decision
        prop2: 
          model.$: 
          token.$: $$.Task.Token
          someProp: 
            nested_model.$: 22
            nested_token.$: true
        Qualifier.$: prod-v1
      Parameters: 
        FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
      End: true
`

export const documentValidResultSelectorIntrinsicFunction = `
  StartAt: Invoke Lambda function
  States: 
    Invoke Lambda function: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke
      ResultSelector: 
        prop1: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
        prop2: 
          Input1.$: "States.Format($.template $.firstName $.lastName)"
          Input2.$: "States.JsonToString($)"
          Input3.$: "States.StringToJson($.escaped)"
          Input4.$: "States.Format($.template $.firstName $.lastName)  "  
          Input5.$: "States.JsonToString($)   " 
          Input6.$: "States.StringToJson($.escaped)   " 
      Parameters: 
        FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
      Next: Succeed state
    Succeed state: 
      Type: Succeed
`

export const documentInvalidResultSelectorIntrinsicFunction = `
  StartAt: Invoke Lambda function
  States: 
    Invoke Lambda function: 
      Type: Task
      Resource: arn:aws:states:::lambda:invoke
      ResultSelector: 
        prop1: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
        prop2: 
          Input1.$: "  States.Format($.template $.firstName $.lastName)"
          Input2.$: "States.JsonToString($"
          Input3.$: "States.StringToJson $.escaped)"
          Input4.$: "States. "
          Input5.$: "JsonToString($)"
          Input6.$: "something else   " 
      Parameters: 
        FunctionName: arn:aws:lambda:REGION:ACCOUNT_ID:function:FUNCTION_NAME
      Next: Succeed state
    Succeed state: 
      Type: Succeed
`
