"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBookmakerSchema } from "@/lib/validations/bookmaker";

export type BookmakerFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type DeleteBookmakerState = {
  ok?: boolean;
  error?: string;
};

function revalidateBookmakerViews() {
  revalidatePath("/settings/bookmakers");
  revalidatePath("/settings");
  revalidatePath("/bets/new");
}

export async function saveBookmaker(
  _prevState: BookmakerFormState,
  formData: FormData,
): Promise<BookmakerFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsed = createBookmakerSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const id = formData.get("id");
  const bookmakerId = typeof id === "string" && id.length > 0 ? id : null;

  try {
    if (bookmakerId) {
      const result = await prisma.bookmaker.updateMany({
        where: { id: bookmakerId, userId: session.user.id },
        data: parsed.data,
      });

      if (result.count === 0) {
        return { error: "Casa de apuestas no encontrada." };
      }
    } else {
      await prisma.bookmaker.create({
        data: { ...parsed.data, userId: session.user.id },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        fieldErrors: {
          name: ["Ya tienes una casa de apuestas con ese nombre."],
        },
      };
    }
    throw error;
  }

  revalidateBookmakerViews();
  return { ok: true };
}

export async function deleteBookmaker(
  _prevState: DeleteBookmakerState,
  formData: FormData,
): Promise<DeleteBookmakerState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsedId = z.string().min(1).safeParse(formData.get("id"));
  if (!parsedId.success) {
    return { error: "Casa de apuestas no válida." };
  }

  const result = await prisma.bookmaker.deleteMany({
    where: { id: parsedId.data, userId: session.user.id },
  });

  if (result.count === 0) {
    return { error: "Casa de apuestas no encontrada." };
  }

  revalidateBookmakerViews();
  return { ok: true };
}
