"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./ui/button";

type ConfirmRequest = {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
  resolve: (value: boolean) => void;
};

type AlertRequest = {
  kind: "alert";
  title: string;
  message: string;
  confirmLabel: string;
  resolve: () => void;
};

type DialogRequest = ConfirmRequest | AlertRequest;

type ConfirmApi = {
  confirm: (
    messageOrOptions:
      | string
      | {
          title?: string;
          message: string;
          confirmLabel?: string;
          cancelLabel?: string;
          tone?: "default" | "danger";
        },
  ) => Promise<boolean>;
  alert: (
    messageOrOptions: string | { title?: string; message: string },
  ) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const close = useCallback(() => setRequest(null), []);

  const confirm = useCallback<ConfirmApi["confirm"]>((messageOrOptions) => {
    const options =
      typeof messageOrOptions === "string"
        ? { message: messageOrOptions }
        : messageOrOptions;
    return new Promise<boolean>((resolve) => {
      setRequest({
        kind: "confirm",
        title: options.title ?? "تأیید عملیات",
        message: options.message,
        confirmLabel: options.confirmLabel ?? "بله، ادامه",
        cancelLabel: options.cancelLabel ?? "انصراف",
        tone: options.tone ?? "default",
        resolve,
      });
    });
  }, []);

  const alert = useCallback<ConfirmApi["alert"]>((messageOrOptions) => {
    const options =
      typeof messageOrOptions === "string"
        ? { message: messageOrOptions }
        : messageOrOptions;
    return new Promise<void>((resolve) => {
      setRequest({
        kind: "alert",
        title: options.title ?? "پیام سامانه",
        message: options.message,
        confirmLabel: "متوجه شدم",
        resolve,
      });
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (request.kind === "confirm") {
          request.resolve(false);
          close();
        } else {
          request.resolve();
          close();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, close]);

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {request ? (
        <div
          className="modal-backdrop confirm-backdrop"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (request.kind === "confirm") {
              request.resolve(false);
              close();
            }
          }}
        >
          <section
            className="modal confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <h2 id="confirm-dialog-title">{request.title}</h2>
            <p id="confirm-dialog-message" className="confirm-dialog-message">
              {request.message}
            </p>
            <div className="row confirm-dialog-actions">
              {request.kind === "confirm" ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      request.resolve(false);
                      close();
                    }}
                  >
                    {request.cancelLabel}
                  </Button>
                  <Button
                    variant={request.tone === "danger" ? "destructive" : "default"}
                    autoFocus
                    onClick={() => {
                      request.resolve(true);
                      close();
                    }}
                  >
                    {request.confirmLabel}
                  </Button>
                </>
              ) : (
                <Button
                  autoFocus
                  onClick={() => {
                    request.resolve();
                    close();
                  }}
                >
                  {request.confirmLabel}
                </Button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx)
    throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
