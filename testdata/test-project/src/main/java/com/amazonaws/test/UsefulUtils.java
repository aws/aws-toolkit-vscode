package com.amazonaws.test;

import org.joda.time.LocalDate;
import org.joda.time.format.DateTimeFormat;
import org.joda.time.format.DateTimeFormatter;

public class UsefulUtils {
    private final DateTimeFormatter fmt = DateTimeFormat.forPattern("yyyy-MM-dd");

    public String addDay(String input) {
        return fmt.print(parse(input).plusDays(1));
    }

    public String upper(String input) {
        return input.toUpperCase();
    }

    private LocalDate parse(String input) {
        return fmt.parseLocalDate(input);
    }
}
