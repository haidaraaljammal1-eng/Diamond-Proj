interface FormErrorProps {
  id?: string;
  message?: string;
}

export function FormError({ id, message }: FormErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert">
      {message}
    </p>
  );
}
