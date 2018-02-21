package com.example;

import com.amazonaws.services.lambda.runtime.Context;

public class ConcreteHandler extends AbstractHandler {
    public String handleRequest(String request, Context context) {
        return request.toUpperCase();
    }
}