"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WAITLIST_ERROR_MESSAGE,
  WAITLIST_INVALID_MESSAGE,
  WAITLIST_SOURCE,
  WAITLIST_SUCCESS_MESSAGE,
  waitlistEmailSchema,
  waitlistRequestSchema,
  waitlistResponseSchema,
} from "@/lib/waitlist-schema";

type WaitlistFormValues = {
  email: string;
  website: string;
};

const endpoint = "/api/waitlist";

export function WaitlistForm() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WaitlistFormValues>({
    defaultValues: {
      email: "",
      website: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const parsed = waitlistRequestSchema.safeParse({
      email: values.email,
      source: WAITLIST_SOURCE,
      website: values.website,
    });

    if (!parsed.success) {
      setError("email", {
        type: "validate",
        message: WAITLIST_INVALID_MESSAGE,
      });
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });

      const json: unknown = await response.json().catch(() => null);
      const parsedResponse = waitlistResponseSchema.safeParse(json);

      if (!parsedResponse.success) {
        setSubmitError(WAITLIST_ERROR_MESSAGE);
        return;
      }

      if (parsedResponse.data.status === "success") {
        setSuccessMessage(
          parsedResponse.data.message || WAITLIST_SUCCESS_MESSAGE,
        );
        return;
      }

      if (parsedResponse.data.status === "invalid") {
        setError("email", {
          type: "server",
          message: parsedResponse.data.message || WAITLIST_INVALID_MESSAGE,
        });
        return;
      }

      setSubmitError(parsedResponse.data.message || WAITLIST_ERROR_MESSAGE);
    } catch {
      setSubmitError(WAITLIST_ERROR_MESSAGE);
    }
  });

  if (successMessage) {
    return (
      <div className="max-w-md rounded-sm border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-mono uppercase tracking-wide text-primary">
        {successMessage}
      </div>
    );
  }

  return (
    <form className="max-w-md space-y-3" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          placeholder="name@studio.com"
          autoComplete="email"
          aria-invalid={errors.email ? "true" : "false"}
          className="placeholder:normal-case"
          {...register("email", {
            validate: (value) =>
              waitlistEmailSchema.safeParse(value).success ||
              WAITLIST_INVALID_MESSAGE,
          })}
        />
        <Button
          className="w-full sm:w-auto shadow-glow"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "JOINING..." : "JOIN THE WAIT LIST"}
        </Button>
      </div>

      <div
        className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
        aria-hidden="true"
      >
        <label htmlFor="website">Website</label>
        <Input
          id="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      {errors.email ? (
        <p className="text-sm text-destructive">{errors.email.message}</p>
      ) : null}

      {submitError ? (
        <p className="text-sm text-destructive">{submitError}</p>
      ) : null}
    </form>
  );
}
