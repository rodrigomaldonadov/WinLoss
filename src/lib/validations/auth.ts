import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Ingresa tu email")
  .max(254, "Email demasiado largo")
  .pipe(z.email("Ingresa un email válido"))
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresa tu contraseña").max(72),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Ingresa tu nombre")
      .max(60, "Máximo 60 caracteres"),
    email: emailSchema,
    password: z
      .string()
      .min(8, "Usa al menos 8 caracteres")
      .max(72, "Máximo 72 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresa tu nombre")
    .max(60, "Máximo 60 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
