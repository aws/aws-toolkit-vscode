// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

interface Function : Resource {
    fun codeLocation(): String
    fun setCodeLocation(location: String)
    fun runtime(): String
    fun handler(): String
}

const val LAMBDA_FUNCTION_TYPE = "AWS::Lambda::Function"
class LambdaFunction(private val delegate: Resource) : Resource by delegate, Function {
    override fun setCodeLocation(location: String) {
        setScalarProperty("Code", location)
    }

    override fun codeLocation(): String = getScalarProperty("Code")

    override fun runtime(): String = getScalarProperty("Runtime")

    override fun handler(): String = getScalarProperty("Handler")

    override fun toString(): String = logicalName
}

const val SERVERLESS_FUNCTION_TYPE = "AWS::Serverless::Function"
class SamFunction(private val delegate: Resource) : Resource by delegate, Function {
    override fun setCodeLocation(location: String) {
        setScalarProperty("CodeUri", location)
    }

    override fun codeLocation(): String = getScalarProperty("CodeUri")

    override fun runtime(): String = getScalarProperty("Runtime")

    override fun handler(): String = getScalarProperty("Handler")

    override fun toString(): String = logicalName
}

internal val RESOURCE_MAPPINGS = mapOf<String, (Resource) -> Resource>(
    LAMBDA_FUNCTION_TYPE to ::LambdaFunction,
    SERVERLESS_FUNCTION_TYPE to ::SamFunction
)