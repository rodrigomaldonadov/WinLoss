"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBankrollSchema } from "@/lib/validations/bankroll";

export type BankrollFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type DeleteBankrollState = {
  ok?: boolean;
  error?: string;
};

function revalidateBankrollViews() {
  revalidatePath("/bankroll");
  revalidatePath("/");
  revalidatePath("/bets");
  revalidatePath("/bets/new");
}

export async function saveBankroll(
  _prevState: BankrollFormState,
  formData: FormData,
): Promise<BankrollFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsed = createBankrollSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency") || "PEN",
    initialAmount: formData.get("initialAmount"),
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
  const bankrollId = typeof id === "string" && id.length > 0 ? id : null;

  try {
    if (bankrollId) {
      const result = await prisma.bankroll.updateMany({
        where: { id: bankrollId, userId: session.user.id },
        data: parsed.data,
      });

      if (result.count === 0) {
        return { error: "Bankroll no encontrado." };
      }
    } else {
      await prisma.bankroll.create({
        data: {
          ...parsed.data,
          userId: session.user.id,
        },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        fieldErrors: {
          name: ["Ya tienes un bankroll con ese nombre."],
        },
      };
    }
    throw error;
  }

  revalidateBankrollViews();
  return { ok: true };
}

export async function deleteBankroll(
  _prevState: DeleteBankrollState,
  formData: FormData,
): Promise<DeleteBankrollState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsedId = z.string().min(1).safeParse(formData.get("id"));
  if (!parsedId.success) {
    return { error: "Bankroll no válido." };
  }

  const bankroll = await prisma.bankroll.findFirst({
    where: { id: parsedId.data, userId: session.user.id },
    select: { id: true, _count: { select: { bets: true } } },
  });

  if (!bankroll) {
    return { error: "Bankroll no encontrado." };
  }

  if (bankroll._count.bets > 0) {
    return {
      error:
        "No puedes eliminar un bankroll con apuestas. Archívalo para conservar el historial.",
    };
  }

  await prisma.bankroll.delete({ where: { id: bankroll.id } });

  revalidateBankrollViews();
  return { ok: true };
}

export async function setBankrollActive(
  bankrollId: string,
  isActive: boolean,
): Promise<DeleteBankrollState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const result = await prisma.bankroll.updateMany({
    where: { id: bankrollId, userId: session.user.id },
    data: { isActive },
  });

  if (result.count === 0) {
    return { error: "Bankroll no encontrado." };
  }

  revalidateBankrollViews();
  return { ok: true };
}
