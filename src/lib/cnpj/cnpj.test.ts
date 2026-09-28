import { describe, expect, it } from "vitest";
import { searchQueries } from "../radar/queries";
import { indexEstablishments, matchPlace } from "./match";
import {
  buildCnaeMap,
  buildMunicipioMap,
  estabelecimentoFromRow,
  razaoFromEmpresaRow,
  rowsFromCsv,
  ufsByCity,
  type Establishment,
  type RadarCity,
} from "./parse";
import { cnaesForSegmentNames } from "./segments";
import { importBlockedThisMonth, monthKeyCuiaba, nextMonthName } from "./import-job";
import { enrichSummary } from "./summary";
import { formatCnae, formatCnpj, normalizeName } from "./text";

const ACADEMIA = ["9313100"];

function est(partial: Partial<Establishment> = {}): Establishment {
  return {
    cnpj: "12345678000190",
    cnpjBasico: "12345678",
    razaoSocial: "ACADEMIA FORTE LTDA",
    nomeFantasia: "ACADEMIA FORTE",
    situacao: "Ativa",
    cnaePrincipal: "9313100",
    cnaesSecundarios: [],
    cnaeDescricao: "Atividades de condicionamento físico",
    tipoLogradouro: "RUA",
    logradouro: "DAS FLORES",
    numero: "123",
    municipio: "Lucas do Rio Verde",
    ...partial,
  };
}

function match(name: string, address: string | null, rows: Establishment[], cnaes = ACADEMIA) {
  return matchPlace({ name, address }, indexEstablishments(rows), cnaes);
}

const FLORES = "Rua das Flores, 123 - Centro, Lucas do Rio Verde - MT";

describe("normalizeName e formatos", () => {
  it("remove sufixo jurídico e acento", () => {
    expect(normalizeName("Academia Forte Ltda")).toBe("academia forte");
    expect(normalizeName("Escritório Silva S/A")).toBe("escritorio silva");
    expect(formatCnpj("12345678000190")).toBe("12.345.678/0001-90");
    expect(formatCnae("9313100")).toBe("9313-1/00");
  });
});

describe("searchQueries", () => {
  it("separa as duas buscas de academia e mantém a frase única dos outros", () => {
    expect(searchQueries("academia de ginástica; academia de musculação")).toEqual([
      "academia de ginástica",
      "academia de musculação",
    ]);
    expect(searchQueries("escritório de advocacia")).toEqual(["escritório de advocacia"]);
  });
});

describe("matchPlace", () => {
  it("dá 100% quando o nome é igual, o CNPJ é único e a rua confere", () => {
    const result = match("Academia Forte", FLORES, [est()]);
    expect(result).toMatchObject({
      status: "confirmado",
      assertiveness: 100,
      cnpj: "12345678000190",
      cnaeMatch: "confere",
    });
  });

  it("dá 80% quando o nome é igual e único, mas o anúncio não tem rua", () => {
    const result = match("Academia Forte", "Lucas do Rio Verde - MT", [est()]);
    expect(result).toMatchObject({ status: "confirmado", assertiveness: 80 });
  });

  it("dá 60% quando o nome do anúncio contém o nome fantasia", () => {
    const result = match("Academia Forte Centro", FLORES, [est()]);
    expect(result).toMatchObject({ status: "confirmado", assertiveness: 60, cnaeMatch: "confere" });
  });

  it("fica de fora quando a rua diverge", () => {
    const result = match("Academia Forte", "Rua das Palmeiras, 10 - Centro, Lucas do Rio Verde - MT", [est()]);
    expect(result.status).toBe("nao_confirmado");
  });

  it("fica de fora quando o número diverge", () => {
    const result = match("Academia Forte", "Rua das Flores, 999 - Centro, Lucas do Rio Verde - MT", [est()]);
    expect(result.status).toBe("nao_confirmado");
  });

  it("fica de fora quando há dois CNPJs diferentes", () => {
    const result = match("Academia Forte", FLORES, [
      est(),
      est({ cnpj: "99887766000155", cnpjBasico: "99887766", logradouro: "DAS PALMEIRAS", numero: "10" }),
    ]);
    expect(result.status).toBe("nao_confirmado");
  });

  it("trata matriz e filial do mesmo CNPJ básico como uma empresa", () => {
    const result = match("Academia Forte", FLORES, [
      est({ cnpj: "12345678000270", numero: "500", logradouro: "OUTRA" }),
      est(),
    ]);
    expect(result).toMatchObject({ status: "confirmado", assertiveness: 100, cnpj: "12345678000190" });
  });

  it("não casa a palavra clinica sozinha", () => {
    const result = match("Clinica", FLORES, [est({ nomeFantasia: "CLINICA ODONTOLOGICA SORRISO", razaoSocial: "CLINICA ODONTOLOGICA SORRISO LTDA" })]);
    expect(result.status).toBe("nao_confirmado");
  });

  it("marca CNAE diverge sem tirar o lead da lista", () => {
    const result = match("Academia Forte", FLORES, [est({ cnaePrincipal: "6911701", cnaeDescricao: "Serviços advocatícios" })]);
    expect(result).toMatchObject({ status: "confirmado", assertiveness: 100, cnaeMatch: "diverge" });
  });

  it("aceita CNAE secundário", () => {
    const result = match("Academia Forte", FLORES, [est({ cnaePrincipal: "6911701", cnaesSecundarios: ["9313100"] })]);
    expect(result).toMatchObject({ cnaeMatch: "confere" });
  });

  it("aceita o prefixo R. na rua do Google", () => {
    const result = match("Academia Forte", "R. das Flores, 123 - Centro, Lucas do Rio Verde - MT", [est()]);
    expect(result).toMatchObject({ assertiveness: 100 });
  });
});

describe("parse da Receita", () => {
  const municipios = rowsFromCsv('"9925";"LUCAS DO RIO VERDE"\n"9067";"CUIABA"\n"3550308";"SAO PAULO"\n');
  const cnaes = rowsFromCsv('"9313100";"Atividades de condicionamento físico"\n');
  const cities: RadarCity[] = [
    { name: "Lucas do Rio Verde", uf: "MT" },
    { name: "Cuiabá", uf: "MT" },
  ];
  const municipioByCode = buildMunicipioMap(municipios, cities);
  const cnaeByCode = buildCnaeMap(cnaes);
  const ufs = ufsByCity(cities);

  it("fica só com estabelecimento das cidades cadastradas", () => {
    const line =
      '"12345678";"0001";"90";"1";"ACADEMIA FORTE";"02";"20200101";"00";"";"";"20200101";"9313100";"9311500";"RUA";"DAS FLORES";"123";"";"CENTRO";"78455000";"MT";"9925";"65";"99999999";"";"";"";"";"";"";""';
    const row = estabelecimentoFromRow(rowsFromCsv(line)[0]!, municipioByCode, cnaeByCode, ufs);
    expect(row).toMatchObject({
      cnpj: "12345678000190",
      municipio: "Lucas do Rio Verde",
      situacao: "Ativa",
      cnaePrincipal: "9313100",
      cnaesSecundarios: ["9311500"],
      cnaeDescricao: "Atividades de condicionamento físico",
    });
    expect(municipioByCode.get("9067")).toBe("Cuiabá");
  });

  it("descarta cidade que não está cadastrada", () => {
    const line =
      '"12345678";"0001";"90";"1";"ACADEMIA FORTE";"02";"20200101";"00";"";"";"20200101";"9313100";"";"RUA";"DAS FLORES";"123";"";"CENTRO";"01000000";"SP";"3550308";"";"";"";"";"";"";"";"";""';
    expect(estabelecimentoFromRow(rowsFromCsv(line)[0]!, municipioByCode, cnaeByCode, ufs)).toBeNull();
  });

  it("aceita cidade de outro estado quando ela está cadastrada", () => {
    const paulo: RadarCity[] = [{ name: "São Paulo", uf: "SP" }];
    const map = buildMunicipioMap(municipios, paulo);
    const line =
      '"12345678";"0001";"90";"1";"ACADEMIA FORTE";"02";"20200101";"00";"";"";"20200101";"9313100";"";"RUA";"DAS FLORES";"123";"";"CENTRO";"01000000";"SP";"3550308";"";"";"";"";"";"";"";"";""';
    const row = estabelecimentoFromRow(rowsFromCsv(line)[0]!, map, cnaeByCode, ufsByCity(paulo));
    expect(row?.municipio).toBe("São Paulo");
  });

  it("descarta o município quando a sigla do estado não confere", () => {
    const errado: RadarCity[] = [{ name: "São Paulo", uf: "MT" }];
    const map = buildMunicipioMap(municipios, errado);
    const line =
      '"12345678";"0001";"90";"1";"ACADEMIA FORTE";"02";"20200101";"00";"";"";"20200101";"9313100";"";"RUA";"DAS FLORES";"123";"";"CENTRO";"01000000";"SP";"3550308";"";"";"";"";"";"";"";"";""';
    expect(estabelecimentoFromRow(rowsFromCsv(line)[0]!, map, cnaeByCode, ufsByCity(errado))).toBeNull();
  });

  it("lê a razão social da empresa", () => {
    expect(razaoFromEmpresaRow(rowsFromCsv('"12345678";"ACADEMIA FORTE LTDA";"2062"')[0]!)).toEqual({
      basico: "12345678",
      razao: "ACADEMIA FORTE LTDA",
    });
  });
});

describe("segmentos e resumo", () => {
  it("conhece o CNAE de academia e o resumo do botão", () => {
    expect(cnaesForSegmentNames(["Academia"])).toEqual(["9313100"]);
    expect(enrichSummary(4, 2, 1)).toBe("4 entraram em Enriquecidos. 2 ficaram sem confirmação. 1 já tinham sido cruzados.");
    expect(enrichSummary(0, 0, 3)).toBe("Nenhum lead novo para cruzar. Os qualificados deste filtro já foram enriquecidos.");
  });

  it("bloqueia outro download da Receita no mesmo mês", () => {
    const september = new Date("2026-09-27T12:00:00-04:00");
    const october = new Date("2026-10-02T12:00:00-04:00");
    expect(monthKeyCuiaba(september)).toBe("2026-09");
    expect(importBlockedThisMonth(september.getTime(), september)).toBe(true);
    expect(importBlockedThisMonth(september.getTime(), october)).toBe(false);
    expect(importBlockedThisMonth(null, september)).toBe(false);
    expect(nextMonthName(september)).toBe("outubro");
  });
});
