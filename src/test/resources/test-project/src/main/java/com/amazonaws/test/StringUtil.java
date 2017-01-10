package com.amazonaws.test;

public class StringUtil {
    public String toUpper(String input) {
        return input.toUpperCase();
    }
    public String toLower(String input) {
        return input.toLowerCase();
    }

    private String doSomethingElse(String input) {
        return input.replace("a", "n");
    }
}
