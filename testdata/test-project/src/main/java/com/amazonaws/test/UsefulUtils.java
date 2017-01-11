package com.amazonaws.test;

import org.joda.time.format.DateTimeFormat;
import org.joda.time.format.DateTimeFormatter;

public class UsefulUtils {
    private final DateTimeFormatter fmt = DateTimeFormat.forPattern("YYYY-mm-DD");
    public String toUpper(String input) {
        return input.toUpperCase();
    }
    public String toLower(String input) {
        return input.toLowerCase();
    }

    public String addDay(String inputDate) {
        return fmt.print(fmt.parseLocalDate(inputDate).plusDays(1));
    }


    private String doSomethingElse(String input) {
        return input.replace("a", "n");
    }
}
