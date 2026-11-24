"""Versioned transport models. Chemical validation belongs to RDKit, not these types."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["parse", "enumerate", "conformers", "projection", "torsion", "export", "relationship", "name"]
    payload: dict[str, Any]


class JobResponse(BaseModel):
    id: str
    status: Literal["queued", "running", "complete", "failed", "cancelled", "timed_out"]
    operation: str
    result: dict[str, Any] | None = None
    error: str | None = None
    elapsed: float = 0


class MappedAtom(BaseModel):
    id: str
    element: str
    formalCharge: int = 0
    isotope: int = 0


class ConformerRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    atoms: list[dict[str, Any]]
    bonds: list[dict[str, Any]]
    method: str | None = None
    energy: float | None = None
    relativeEnergy: float | None = None
    energyUnit: str | None = None


class MoleculeRecord(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    schema_version: str = Field(alias="schema")
    id: str
    connectivityId: str
    stereoisomerId: str
    notation: str
    atoms: list[str]
    atomIds: list[str]
    bonds: list[dict[str, Any]]
    charges: list[int]
    isotopes: list[int]
    hydrogens: list[int]
    molblock: str
    conformers: list[ConformerRecord] = Field(default_factory=list)
