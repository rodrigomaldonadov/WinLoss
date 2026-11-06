"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

export type PasswordResetState = {
  ok?: boolean;
  error?: string;
  /** Solo en desarrollo: enlace para probar el flujo sin proveedor de email. */
  resetUrl?: string;
  fieldErrors?: Record<string, string[]>;
};

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutos

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

function appBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL;
  return (configured ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Envía el enlace por Resend si está configurado; si no, lo registra en el log. */
async function deliverResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`[password-reset] ${email} → ${resetUrl}`);
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "WinLoss <onboarding@resend.dev>",
        to: email,
        subject: "Restablece tu contraseña de WinLoss",
        html: `
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p><a href="${resetUrl}">Crear una contraseña nueva</a></p>
          <p>El enlace caduca en 30 minutos. Si no fuiste tú, ignora este mensaje.</p>
        `,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[password-reset] Resend ${response.status}: ${detail}`);
    }
  } catch (error) {
    console.error("[password-reset] no se pudo enviar el email:", error);
  }
}

export async function requestPasswordResetAction(
  _prevState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Respuesta genérica siempre: no revelamos si el email existe.
    if (user) {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + TOKEN_TTL_MS);

      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { identifier: email } }),
        prisma.verificationToken.create({
          data: { identifier: email, token, expires },
        }),
      ]);

      const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await deliverResetEmail(email, resetUrl);

      if (process.env.NODE_ENV !== "production") {
        return { ok: true, resetUrl };
      }
    }
  } catch (error) {
    console.error("[password-reset] error:", error);
    return {
      error:
        "No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.",
    };
  }

  return { ok: true };
}

export async function resetPasswordAction(
  _prevState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const { token, password } = parsed.data;

  const record = await prisma.verificationToken.findFirst({
    where: { token },
  });

  if (!record || record.expires.getTime() < Date.now()) {
    return {
      error:
        "El enlace es inválido o ha caducado. Solicita uno nuevo desde “¿Olvidaste tu contraseña?”.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true },
  });

  if (!user) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: record.identifier },
    });
    return {
      error:
        "El enlace es inválido o ha caducado. Solicita uno nuevo desde “¿Olvidaste tu contraseña?”.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hash(password, 12) },
      }),
      prisma.verificationToken.deleteMany({
        where: { identifier: record.identifier },
      }),
    ]);
  } catch (error) {
    console.error("[password-reset] no se pudo actualizar:", error);
    return {
      error:
        "No pudimos actualizar tu contraseña. Inténtalo de nuevo en unos minutos.",
    };
  }

  redirect("/login?reset=1");
}
