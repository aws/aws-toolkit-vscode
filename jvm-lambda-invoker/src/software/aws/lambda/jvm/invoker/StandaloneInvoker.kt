// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.lambda.jvm.invoker

import com.amazonaws.services.lambda.runtime.ClientContext
import com.amazonaws.services.lambda.runtime.CognitoIdentity
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.commons.cli.DefaultParser
import org.apache.commons.cli.HelpFormatter
import org.apache.commons.cli.Option
import org.apache.commons.cli.Options
import org.apache.commons.cli.ParseException
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.time.Duration
import java.time.Instant
import java.util.UUID

class StandaloneInvoker(private val methodLocator: MethodLocator, private val log: (String?) -> Unit = System.out::println) {
    private val mapper = ObjectMapper()

    fun invoke(handler: String, input: String?): String? {
        val (clz, method) = methodLocator.locate(handler)
        val params = createParameters(method, input)
        val outputStream = params.find { it is ByteArrayOutputStream } as? ByteArrayOutputStream
        val response = when {
            Modifier.isStatic(method.modifiers) -> method.invoke(null, *params)
            else -> method.invoke(clz.newInstance(), *params)
        }
        return mapResponse(method, outputStream ?: response)
    }

    private fun mapResponse(method: Method, response: Any?): String? {
        return when {
            method.returnType == String::class.java && response != null -> response as String
            method.returnType == Void.TYPE && response == null -> null
            method.returnType == Void.TYPE && response is ByteArrayOutputStream -> String(response.toByteArray())
            else -> mapper.writerFor(method.returnType).writeValueAsString(response)
        }
    }

    private fun createParameters(method: Method, input: String?): Array<Any?> {
        return when {
            method.parameterCount == 0 && input == null -> arrayOf()
            method.parameterCount == 0 -> throw RuntimeException("Handler does not expect input parameters, got $input")
            else -> createParameters(input, method.parameterTypes.first(), method.parameterTypes.takeLast(method.parameterCount - 1))
        }
    }

    private fun createParameters(input: String?, firstParameterType: Class<*>, otherParameters: List<Class<*>>): Array<Any?> {
        val params = mutableListOf<Any?>()
        when (firstParameterType) {
            String::class.java -> params.add(input)
            InputStream::class.java -> params.add(ByteArrayInputStream(input?.toByteArray()))
            else -> params.add(mapper.readValue(input, firstParameterType))
        }

        otherParameters.forEach {
            when {
                it.name == LAMBDA_CONTEXT -> params.add(DummyContext(log))
                it == OutputStream::class.java -> params.add(ByteArrayOutputStream())
            }
        }

        return params.toTypedArray()
    }

    companion object {
        private const val LAMBDA_CONTEXT = "com.amazonaws.services.lambda.runtime.Context"

        @JvmStatic
        fun main(args: Array<String>) {

            val options = Options()
            options.addOption(Option("h", "handler", true, "Lambda handler").apply { isRequired = true })
            options.addOption(Option("i", "input", true, "Lambda input"))

            val cmd = try {
                DefaultParser().parse(options, args)
            } catch (e: ParseException) {
                println(e.message)
                HelpFormatter().printHelp("standalone-invoker", options)
                System.exit(1)
                throw e
            }
            val handler = cmd.getOptionValue("handler")
            val input = cmd.getOptionValue("input")
            println(StandaloneInvoker(MethodLocator()).invoke(handler, input))
        }
    }
}

class MethodLocator {

    fun locate(handler: String): Pair<Class<*>, Method> {
        val handlerParts = handler.split("::")
        val (className, methodName) = when (handlerParts.size) {
            1 -> handlerParts[0] to null
            2 -> handlerParts[0] to handlerParts[1]
            else -> throw RuntimeException("Invalid handler format $handler, must be 'fullyQualifiedClassName[::methodName]'")
        }

        val clz = Class.forName(className)

        return clz to when {
            methodName != null -> determineMethod(clz, methodName)
            else -> determineMethod(clz)
        }
    }

    private fun determineMethod(clz: Class<*>): Method {
        val implementsLambdaInterface = clz.interfaces.any { LAMBDA_INTERFACES.contains(it.name) }

        if (!implementsLambdaInterface) {
            throw RuntimeException("Class-only handler definitions must implement one of the Lambda standard interfaces: $LAMBDA_INTERFACES")
        }

        return determineMethod(clz, "handleRequest")
    }

    private fun determineMethod(clz: Class<*>, methodName: String): Method {
        val methods = clz.methods.filter { it.name == methodName && !it.isSynthetic }
        return when (methods.size) {
            1 -> methods.first()
            0 -> throw RuntimeException("Method $methodName not found on class ${clz.name}")
            else -> throw RuntimeException("More than one method named $methodName found on class ${clz.name}")
        }
    }

    private companion object {

        val LAMBDA_INTERFACES = setOf(
            "com.amazonaws.services.lambda.runtime.RequestStreamHandler",
            "com.amazonaws.services.lambda.runtime.RequestHandler"
        )
    }
}

class DummyContext(private val log: (String?) -> Unit, private val timeout: Duration = Duration.ofMinutes(1)) : Context {
    private val start = Instant.now()

    override fun getLogStreamName(): String? = null

    override fun getClientContext(): ClientContext? = null

    override fun getFunctionName(): String = "dummyFunctionName"

    override fun getRemainingTimeInMillis(): Int = (timeout - Duration.between(start, Instant.now())).toMillis().toInt()

    override fun getLogger(): LambdaLogger = LambdaLogger { log(it) }

    override fun getInvokedFunctionArn() = "arn:aws:lambda:us-east-1:123456789012:function:FunctionName"

    override fun getMemoryLimitInMB(): Int = 256

    override fun getLogGroupName(): String? = null

    override fun getFunctionVersion(): String = "1.0"

    override fun getIdentity(): CognitoIdentity? = null

    override fun getAwsRequestId(): String = UUID.randomUUID().toString()
}
