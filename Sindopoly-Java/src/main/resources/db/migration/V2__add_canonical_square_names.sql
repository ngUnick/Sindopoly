-- The legacy frontend catalog is promoted once into MariaDB so future UI layers
-- consume one persistent, versioned name for every canonical board position.
ALTER TABLE square ADD COLUMN name VARCHAR(100) NULL AFTER id;

UPDATE square
SET name = CASE id
    WHEN 0 THEN 'ΑΦΕΤΗΡΙΑ'
    WHEN 1 THEN 'ΓΥΜΝΑΣΤΗΡΙΟ'
    WHEN 2 THEN 'ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ'
    WHEN 3 THEN 'ΒΙΒΛΙΟΘΗΚΗ'
    WHEN 4 THEN 'ΕΝΟΙΚΙΟ'
    WHEN 5 THEN 'ΚΙΟΣΚΙ Σ.Ε.Υ.Π.'
    WHEN 6 THEN 'ΣΤΑΣΗ ΔΙΠΑΕ'
    WHEN 7 THEN 'ΚΑΡΤΑ ΕΝΤΟΛΗΣ'
    WHEN 8 THEN 'ΣΤΑΣΗ ΙΘΑΚΗ'
    WHEN 9 THEN 'ΣΤΑΣΗ ΤΕΡΜΑΤΙΚΟΥ'
    WHEN 10 THEN 'ΦΥΛΑΚΗ'
    WHEN 11 THEN 'ΣΠΛΑΣ'
    WHEN 12 THEN 'ΚΥΛΙΚΕΙΟ'
    WHEN 13 THEN 'ΠΟΔΗΛΑΤΟ'
    WHEN 14 THEN 'ΜΙΚΕΛ'
    WHEN 15 THEN 'ΚΙΟΣΚΙ ΔΙΟΙΚΗΣΗΣ'
    WHEN 16 THEN 'ΒΙΒΛΙΟΘΗΚΟΝΟΜΙΑΣ'
    WHEN 17 THEN 'ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ'
    WHEN 18 THEN 'ΠΡΟΣΧΟΛΙΚΩΝ'
    WHEN 19 THEN 'ΤΕΧΝΟΛΟΓΙΑΣ ΤΡΟΦΙΜΩΝ'
    WHEN 20 THEN 'ΝΑΥΤΙΛΟΣ'
    WHEN 21 THEN 'ΠΕΡΙΒΑΛΛΟΝΤΟΣ'
    WHEN 22 THEN 'ΚΑΡΤΑ ΕΝΤΟΛΗΣ'
    WHEN 23 THEN 'ΓΕΩΠΟΝΙΑΣ'
    WHEN 24 THEN 'ΔΙΑΤΡΟΦΗΣ/ΔΙΑΙΤΟΛΟΓΙΑΣ'
    WHEN 25 THEN 'ΚΙΟΣΚΙ ΕΞΟΔΟΥ'
    WHEN 26 THEN 'ΜΑΙΕΥΤΙΚΗΣ'
    WHEN 27 THEN 'ΝΟΣΗΛΕΥΤΙΚΗΣ'
    WHEN 28 THEN 'ΛΕΣΧΗ'
    WHEN 29 THEN 'ΒΙΟΪΑΤΡΙΚΩΝ'
    WHEN 30 THEN 'ΠΑΝΕ ΣΤΗ ΦΥΛΑΚΗ'
    WHEN 31 THEN 'ΤΟΥΡΙΣΜΟΥ'
    WHEN 32 THEN 'ΔΙΟΙΚΗΣΗΣ'
    WHEN 33 THEN 'ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ'
    WHEN 34 THEN 'ΛΟΓΙΣΤΙΚΗΣ'
    WHEN 35 THEN 'ΚΙΟΣΚΙ ΠΛΗΡΟΦΟΡΙΚΗΣ'
    WHEN 36 THEN 'ΚΑΡΤΑ ΕΝΤΟΛΗΣ'
    WHEN 37 THEN 'ΠΛΗΡΟΦΟΡΙΚΗΣ'
    WHEN 38 THEN 'ΕΞΟΔΑ ΓΙΑ ΨΩΝΙΑ'
    WHEN 39 THEN 'ΗΛΕΚΤΡΟΝΙΚΗΣ'
END;

-- Any unexpected row outside 0..39 remains NULL and makes the migration fail closed.
ALTER TABLE square MODIFY COLUMN name VARCHAR(100) NOT NULL;
