-- Crea il trigger che invoca handle_new_user() ad ogni nuovo utente in auth.users.
-- La funzione handle_new_user() esiste già: questo trigger mancava.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();